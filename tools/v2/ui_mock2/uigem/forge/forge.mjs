// uigem 아이콘 굽기 — prep.py 가 만든 상아 톤 재료(/dev/shm/uigem/src) + 벡터 요소(궤적·달·과녁·지도…)를 SVG 로 합치고,
// 같은 「상아 부조」 필터(윗왼쪽 빛의 볼록 음영 + 짙은 윤곽)를 씌워 256px 투명 그림으로 굽는다. 유료 생성 0.
//   python3 tools/v2/ui_mock2/uigem/forge/prep.py && node tools/v2/ui_mock2/uigem/forge/forge.mjs
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const SRC = 'file:///dev/shm/uigem/src';
const OUT = process.argv[2] || '/dev/shm/uigem/icons';
mkdirSync(OUT, { recursive: true });
const IV = '#efe5cf', IV2 = '#d8cbb0', CUT = '#5a4636';
const rad = (d) => d * Math.PI / 180;
const P = (cx, cy, r, a) => [(cx + r * Math.cos(rad(a))).toFixed(1), (cy + r * Math.sin(rad(a))).toFixed(1)];
// 초승달 궤적: 반지름 R 의 호(a0→a1, 시계 방향) + 더 완만한 호로 되돌아온다 → 양 끝이 뾰족
const crescent = (cx, cy, R, a0, a1, k = 1.45, fill = IV, extra = '') => { const p0 = P(cx, cy, R, a0), p1 = P(cx, cy, R, a1), lg = Math.abs(a1 - a0) > 180 ? 1 : 0; return `<path d="M${p0} A${R} ${R} 0 ${lg} 1 ${p1} A${(R * k).toFixed(1)} ${(R * k).toFixed(1)} 0 0 0 ${p0}Z" fill="${fill}" ${extra}/>`; };
// 방추형 줄(속도선): (x0,y0)→(x1,y1), 가운데 두께 w
const spindle = (x0, y0, x1, y1, w, fill = IV) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * w / 2, ny = dx / l * w / 2, mx = (x0 + x1) / 2, my = (y0 + y1) / 2; return `<path d="M${x0} ${y0} Q${mx + nx} ${my + ny} ${x1} ${y1} Q${mx - nx} ${my - ny} ${x0} ${y0}Z" fill="${fill}"/>`; };
const img = (n, x, y, h, w, flip = false, rot = 0) => `<image href="${SRC}/${n}.png" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" transform="${flip ? `translate(${2 * x + w} 0) scale(-1 1) ` : ''}${rot ? `rotate(${rot} ${x + w / 2} ${y + h / 2})` : ''}"/>`;
const ruby = (inner) => `<g filter="url(#rg)">${inner}</g>`;
const arcArrow = (cx, cy, r, a0, a1, w = 11) => { const p0 = P(cx, cy, r, a0), p1 = P(cx, cy, r, a1), t = a1 + 90, h = [P(+p1[0], +p1[1], w * 1.5, t - 180 + 90 - 62), P(+p1[0], +p1[1], w * 1.5, t - 180 - 90 + 62)], tip = P(+p1[0], +p1[1], w * 1.9, t - 90); return `<path d="M${p0} A${r} ${r} 0 0 1 ${p1}" fill="none" stroke="${IV}" stroke-width="${w}" stroke-linecap="round"/><path d="M${P(cx, cy, r - w * 1.35, a1)} L${P(cx, cy, r + w * 1.35, a1)} L${P(cx, cy, r, a1 + 26 * 60 / r)}Z" fill="${IV}"/>`; };

// 각 아이콘: iv = 상아 필터를 받는 층, red = 진홍 보석 층(필터 밖), back = 상아 층 뒤(달 등)
const ICONS = {
  attack: { iv: img('fig_sl50', 2, 26, 222, 169) + crescent(112, 134, 114, -76, 72, 1.5), red: crescent(116, 134, 124, -68, 64, 1.16, 'url(#rb)') },
  jump: { iv: img('fig_jump', 28, 2, 214, 194) + spindle(82, 204, 82, 254, 13) + spindle(122, 214, 122, 256, 15) + spindle(162, 204, 162, 254, 13) },
  dash: { iv: spindle(4, 86, 96, 86, 13) + spindle(16, 128, 112, 128, 15) + spindle(2, 170, 92, 170, 13) + spindle(34, 208, 104, 208, 10) + img('fig_dash', 62, 8, 240, 193) },
  guard: { iv: img('fig_hurt', 6, 14, 230, 147) + crescent(78, 130, 124, -62, 62, 1.28) + crescent(92, 130, 88, -48, 48, 1.3, IV2) + spindle(214, 60, 240, 34, 9) + spindle(226, 132, 252, 132, 9) + spindle(214, 204, 240, 230, 9) },
  lock: { iv: [0, 90, 180, 270].map((a) => `<path d="M${P(128, 128, 104, a - 33)} A104 104 0 0 1 ${P(128, 128, 104, a + 33)}" fill="none" stroke="${IV}" stroke-width="11" stroke-linecap="round"/><path d="M${P(128, 128, 122, a)} L${P(128, 128, 84, a)}" stroke="${IV}" stroke-width="11" stroke-linecap="round"/>`).join('') + `<g transform="translate(128 132) scale(1.22) translate(-128 -116)"><path d="M128 100l8-14 6 16q30-22 62-8q-14 6-16 22q-12-8-22 2q-4-10-16-6q2 18-22 34q-24-16-22-34q-12-4-16 6q-10-10-22-2q-2-16-16-22q32-14 62 8l6-16z" fill="${IV}"/><path d="M128 112v22M112 104q-14-6-30-4M144 104q14-6 30-4" stroke="${CUT}" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`, red: `<circle cx="119" cy="124" r="4.6" fill="url(#rb)"/><circle cx="137" cy="124" r="4.6" fill="url(#rb)"/>` },
  swap: { iv: img('obj_sword_3', 44, 44, 168, 168, true) + img('obj_sword_5', 44, 44, 168, 168) + arcArrow(128, 128, 114, 152, 248, 12) + arcArrow(128, 128, 114, -28, 68, 12), red: `<circle cx="128" cy="128" r="8" fill="url(#rb)"/>` },
  mount: { iv: `<path d="M150 40c-10-14-22-18-30-18l4 22c-26 10-46 34-58 62l-30 40c-6 8-4 20 6 24c10 4 18 2 26-6l20-18c14 2 26-2 36-10c-4 28-22 52-40 72l0 26l118 0c8-44 6-96-14-140c-10-22-22-40-38-54z" fill="${IV}"/><path d="M150 40c16 14 28 32 38 54c20 44 22 96 14 140l-22 0c6-50 0-110-30-160c-4-12-4-24 0-34z" fill="${IV2}"/><path d="M158 52c18 22 30 52 34 84M172 78c12 24 18 54 18 86M150 70c16 20 26 46 30 74M56 122l34 26M70 104l40 34M124 136c8-10 12-22 12-36" stroke="${CUT}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M92 88c8-6 18-6 24 0c-6 8-18 8-24 0z" fill="${CUT}"/><circle cx="44" cy="156" r="3.5" fill="${CUT}"/>`, red: `<circle cx="100" cy="142" r="7.5" fill="url(#rb)"/>` },
  s1: { back: `<path d="M22 150 A106 40 0 0 1 234 150" fill="none" stroke="${IV2}" stroke-width="9" stroke-linecap="round" opacity=".9"/>`, iv: img('fig_sl30', 36, 30, 178, 188) + `<path d="M16 152 A112 46 0 0 0 240 152 A112 64 0 0 1 16 152Z" fill="${IV}"/><path d="M40 176 A96 40 0 0 0 216 176" fill="none" stroke="${CUT}" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>` },
  s2: { iv: [-46, -8, 30].map((a) => { const e = P(112, 138, 142, a); return spindle(112, 138, +e[0], +e[1], 30); }).join('') + img('fig_a3thrust', 0, 62, 180, 167) },
  s3: { iv: `<path d="M128 30c9 0 15 7 15 15c0 4-1 7-3 9c30 10 44 38 46 78c1 20 8 34 22 46l0 16l-160 0l0-16c14-12 21-26 22-46c2-40 16-68 46-78c-2-2-3-5-3-9c0-8 6-15 15-15z" fill="${IV}"/><path d="M76 150h104c1 12 4 21 9 30h-122c5-9 8-18 9-30z" fill="${IV2}"/><path d="M84 110h88M76 150h104M66 180h124" stroke="${CUT}" stroke-width="3" fill="none"/><path d="M128 66l0 0M112 128l8-8 8 8 8-8 8 8" stroke="${CUT}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + [[30, 40], [12, 60]].map(([x, s]) => `<path d="M${x} ${128 - s} Q${x - 16} 128 ${x} ${128 + s}" fill="none" stroke="${IV}" stroke-width="9" stroke-linecap="round"/><path d="M${256 - x} ${128 - s} Q${256 - x + 16} 128 ${256 - x} ${128 + s}" fill="none" stroke="${IV}" stroke-width="9" stroke-linecap="round"/>`).join(''), red: `<circle cx="128" cy="214" r="15" fill="url(#rb)"/>` },
  ult: { back: `<g filter="url(#rg)"><circle cx="128" cy="116" r="100" fill="url(#moon)"/><circle cx="92" cy="84" r="16" fill="#7c0a1c" opacity=".35"/><circle cx="160" cy="150" r="24" fill="#7c0a1c" opacity=".3"/><circle cx="170" cy="74" r="9" fill="#7c0a1c" opacity=".3"/></g>`, iv: img('fig_airprep', 52, 18, 222, 152) + crescent(128, 96, 142, 28, 152, 1.25) },
  map: { iv: `<path d="M30 74L94 52V198L30 220Z" fill="${IV}"/><path d="M94 52L162 74V220L94 198Z" fill="${IV2}"/><path d="M162 74L226 52V198L162 220Z" fill="${IV}"/><path d="M52 186Q84 150 118 158T152 118T196 104" fill="none" stroke="${CUT}" stroke-width="4" stroke-dasharray="3 9" stroke-linecap="round"/><path d="M62 84l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="${CUT}"/><path d="M118 186h30M176 150l24 8M176 170l24 8" stroke="${CUT}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`, red: `<path d="M196 58c-13 0-22 10-22 22c0 16 22 36 22 36s22-20 22-36c0-12-9-22-22-22z" fill="url(#rb)"/><circle cx="196" cy="80" r="7" fill="#ffd9d9" opacity=".85"/>` },
  bag: { iv: img('obj_moneybag', 26, 24, 208, 204), red: `<circle cx="121" cy="138" r="9" fill="url(#rb)"/>` },
  menu: { iv: img('obj_sub_bible', 34, 20, 216, 188), red: `<circle cx="124" cy="112" r="8" fill="url(#rb)"/>` },
  auto: { iv: img('obj_sub_stopwatch', 62, 34, 188, 132) + arcArrow(128, 140, 108, 120, 215, 11) + arcArrow(128, 140, 108, -60, 35, 11) },
  quest: { iv: img('obj_scroll_protect', 22, 22, 212, 212), red: `<circle cx="111" cy="118" r="17" fill="url(#rb)"/>` },
  potion: { iv: img('obj_potion_hp', 42, 20, 216, 172), red: `<path d="M128 122c-12 16-20 26-20 38a20 20 0 0 0 40 0c0-12-8-22-20-38z" fill="url(#rb)"/>` },
  key: { iv: img('obj_key', 24, 22, 212, 208), red: `<circle cx="84" cy="170" r="8" fill="url(#rb)"/>` },
  lantern: { iv: img('obj_rift_lantern', 60, 16, 224, 136), red: `<path d="M128 112c-9 13-14 20-14 30a14 14 0 0 0 28 0c0-10-5-17-14-30z" fill="url(#rb)"/>` },
  fang: { iv: img('obj_m_fang', 36, 18, 220, 184) },
};
const defs = `<defs>
<filter id="iv" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b"/>
  <feDiffuseLighting in="b" surfaceScale="4.5" diffuseConstant="1.22" lighting-color="#fff" result="df"><feDistantLight azimuth="232" elevation="56"/></feDiffuseLighting>
  <feComposite in="SourceGraphic" in2="df" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>
  <feSpecularLighting in="b" surfaceScale="4.5" specularConstant=".38" specularExponent="22" lighting-color="#fffaf0" result="sp"><feDistantLight azimuth="232" elevation="48"/></feSpecularLighting>
  <feComposite in="sp" in2="lit" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit2"/>
  <feComposite in="lit2" in2="SourceAlpha" operator="in" result="lit3"/>
  <feMorphology in="SourceAlpha" operator="dilate" radius="2.2" result="d"/>
  <feFlood flood-color="#0d0908" flood-opacity=".78"/><feComposite in2="d" operator="in" result="ol"/>
  <feGaussianBlur in="ol" stdDeviation="2.6" result="olb"/>
  <feMerge><feMergeNode in="olb"/><feMergeNode in="ol"/><feMergeNode in="lit3"/></feMerge>
</filter>
<filter id="rg" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
  <feMorphology in="SourceAlpha" operator="dilate" radius="1.6" result="d"/><feFlood flood-color="#1a0408" flood-opacity=".8"/><feComposite in2="d" operator="in" result="ol"/>
  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="gl"/><feComponentTransfer in="gl" result="gl2"><feFuncA type="linear" slope=".55"/></feComponentTransfer>
  <feMerge><feMergeNode in="gl2"/><feMergeNode in="ol"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<radialGradient id="rb" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#ffb3b0"/><stop offset=".28" stop-color="#ff4a5c"/><stop offset=".7" stop-color="#c8142e"/><stop offset="1" stop-color="#7a0a1e"/></radialGradient>
<radialGradient id="moon" cx=".38" cy=".32" r=".78"><stop offset="0" stop-color="#ff8f8a"/><stop offset=".4" stop-color="#e8283f"/><stop offset="1" stop-color="#8c0c22"/></radialGradient>
</defs>`;
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:transparent}svg{display:block}</style><body>${Object.entries(ICONS).map(([k, v]) => `<svg id="i-${k}" xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${defs}${v.back || ''}<g filter="url(#iv)">${v.iv}</g>${v.red ? ruby(v.red) : ''}</svg>`).join('')}</body>`;
writeFileSync('/dev/shm/uigem/forge.html', html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: 300, height: 300 }, deviceScaleFactor: 1 })).newPage();
page.on('console', (m) => console.log('[c]', m.text())); page.on('requestfailed', (r) => console.log('[fail]', r.url()));
await page.goto('file:///dev/shm/uigem/forge.html');
await page.evaluate(() => Promise.all([...document.querySelectorAll('image')].map((i) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = i.getAttribute('href'); }))));
await page.waitForTimeout(400);
for (const k of Object.keys(ICONS)) await page.locator('#i-' + k).screenshot({ path: `${OUT}/${k}.png`, omitBackground: true });
console.log('baked', Object.keys(ICONS).length, 'icons →', OUT);
await browser.close();
