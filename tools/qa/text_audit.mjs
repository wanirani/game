// 글자 크기 감사 (benchmark #7, platform §6.2 P-03): 화면마다 실제로 그려진 글자의 화면 크기(CSS px) — 게임 캔버스에 바로
// 그린 글자 + 메뉴 레이어·글자 캐시에 구워 붙인 글자(tools/qa/lib/taps.mjs 의 textAll) — 를 휴대폰 크기에서 재고,
// 기준선(tools/qa/text_ratchet.json)보다 작아지면 실패한다 (래칫: 최소·p10·중앙값이 기준 − 0.3 px 아래로 내려가면 빨강).
//
//   node tools/qa/text_audit.mjs [--vp phone2,phone1] [--only front,options,menu,…] [--text-size normal|large|xlarge]
//                                [--ui-scale auto|1|1.15|1.3|1.5] [--update] [--shots] [--md <file>]
//   groups: front options account arcade town games pause dialogue results menu (taps.mjs VISITS + 메뉴 10 탭 + 상태 2쪽)
//   --text-size : 설정 textSize (글자 크기) 로 연다. 기준선은 글자 크기별로 따로 둔다
//   --update    : 이번 측정을 그 글자 크기의 기준선으로 쓴다 (화면이 좋아졌을 때만 — 래칫)
//   --shots     : 화면마다 스크린샷 (/tmp/claude-0/qa/platform/shots/text_audit/<글자 크기>_<vp>_<화면>.png)
// 표(마크다운)는 표준 출력과 /tmp/claude-0/qa/platform/text_audit_<글자 크기>.md 에 남는다. 목표(정보 12 · 본문 14 CSS px)
// 는 표의 '<12' 열로만 보여 준다 (실패 아님). '크게'·'아주 크게' 는 uiScale 화면의 p10 이 그 글자 크기의 목표
// (12 · 13.5 CSS px) 이상인지도 검사한다 — 하한은 ui.font() 를 거친 글자에만 걸린다 (ctx.font 를 직접 쓰는 곳은 감사 표의 src 로 찾는다).
import fs from 'node:fs';
import path from 'node:path';
import { Suite } from './lib/suite.mjs';
import { openEnv, ROOT, REPORT_DIR } from './lib/server.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';
import { installTapRecorder, auditScene, VISITS, VISIT_BASE } from './lib/taps.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';

const suite = new Suite('text_audit');
const A = suite.args;
const SIZE = ['normal', 'large', 'xlarge'].includes(A['text-size']) ? A['text-size'] : 'normal';
const UI = A['ui-scale'] && A['ui-scale'] !== true ? (A['ui-scale'] === 'auto' ? 'auto' : Number(A['ui-scale'])) : null;
const TARGET = { normal: 0, large: 12, xlarge: 13.5 };   // 글자 크기 설정의 목표 CSS px (game.js TEXT_SIZES 와 같은 값)
const TOL = 0.3;
const RATCHET = path.join(ROOT, 'tools/qa/text_ratchet.json');
const SHOTS = path.join(REPORT_DIR, 'shots/text_audit');
const base = (() => { try { return JSON.parse(fs.readFileSync(RATCHET, 'utf8')); } catch { return {}; } })();
const baseFor = (vp, scene) => base?.[SIZE]?.[vp]?.[scene] ?? null;
const rows = [];   // [{vp, group, scene, top, uiScale, uiK, floor, n, nLayer, min, p10, median, under12, smallest}]

const MENU_TABS = ['status', 'equip', 'inventory', 'skills', 'class', 'companions', 'quests', 'docs', 'bestiary', 'system'];
const GROUPS = { ...VISITS, menu: null };
const settings = { ...(SIZE !== 'normal' ? { textSize: SIZE } : {}), ...(UI != null ? { uiScale: UI } : {}) };
const env = await openEnv();

/** 한 화면을 재고 기록 + 래칫 검사 */
async function measure(s, vp, group, scene, ev, wait) {
  const a = await auditScene(s.page, ev, { wait, rebake: true, settle: 250 });
  if (A.shots) { fs.mkdirSync(SHOTS, { recursive: true }); await s.screenshot(path.join(SHOTS, `${SIZE}_${vp}_${scene}.png`)); }
  const t = a.textAll ?? {};
  const row = { vp, group, scene, top: a.top ?? null, uiScale: !!a.uiScale, uiK: a.uiK ?? null, floor: a.textFloor ?? null, n: t.n ?? 0, nLayer: t.nLayer ?? 0, min: t.min, p10: t.p10, median: t.median, under12: t.under12, smallest: t.smallest ?? [], error: a.error ?? null };
  rows.push(row);
  const b = baseFor(vp, scene);
  await suite.check({ id: `text.${scene}.${vp}`, group, issue: 'P-03', title: `${scene}: effective text size (CSS px) not below the ${SIZE} baseline at ${VIEWPORTS[vp].css.w}×${VIEWPORTS[vp].css.h}`, session: s }, async () => {
    if (a.error) return { pass: false, detail: a.error };
    if (!row.n) return { skip: `${a.top}: no text recorded` };
    const now = `n ${row.n} (layers ${row.nLayer}) min ${row.min} p10 ${row.p10} median ${row.median} <12 ${Math.round((row.under12 ?? 0) * 100)}%`;
    const small = row.smallest.slice(0, 3).map((x) => `${x.s}@${x.css}${x.src ? ' ' + x.src : ''}`).join(' | ');
    if (!b) return { pass: true, detail: `${now}; no ${SIZE} baseline yet (--update writes one); smallest ${small}`, metrics: row };
    const bad = ['min', 'p10', 'median'].filter((k) => row[k] != null && b[k] != null && row[k] < b[k] - TOL);
    return { pass: !bad.length, detail: `${now} vs baseline min ${b.min} p10 ${b.p10} median ${b.median}${bad.length ? ' — below on ' + bad.join(', ') : ''}; smallest ${small}`, metrics: row };
  });
  if (SIZE !== 'normal' && row.uiScale && row.n) {
    await suite.check({ id: `text.target.${scene}.${vp}`, group, issue: 'P-03', title: `${scene}: '${SIZE}' p10 ≥ ${TARGET[SIZE]} CSS px` }, async () => ({
      pass: row.p10 >= TARGET[SIZE] - TOL, detail: `p10 ${row.p10} min ${row.min} (floor ${row.floor} UI px, uiK ${row.uiK}); smallest ${row.smallest.slice(0, 4).map((x) => `${x.s}@${x.css}${x.src ? ' ' + x.src : ''}`).join(' | ')}`,
    }));
  }
  return a;
}

try {
  for (const group of Object.keys(GROUPS)) await suite.group(group, async () => {
    for (const vp of suite.vps(['phone2', 'phone1'])) {
      if (group === 'menu') {
        // 메뉴 10 탭 (platform_menu 와 같은 길: 스테이지 s02 → menu_seed) + 상태 탭 2쪽 (낮은 화면에서 쪽이 있으면)
        const s = await env.page(vp, 'index.html?scene=stage&stage=s02', { settings });
        await s.waitGame('!!g.world?.player');
        await s.wait(1500);
        await s.skipDialogue();
        if (VIEWPORTS[vp].touch) await ensureTouchMode(new Touch(s.cdp, s.page), s.page);
        await installTapRecorder(s.page);
        await s.eval("import('/tools/menu_seed.js?seed=1&n=" + vp + "')");
        await s.wait(300);
        for (const tab of MENU_TABS) {
          await measure(s, vp, group, `menu_${tab}`, `import('/tools/menu_seed.js?tab=${tab}&n=${tab}${vp}${SIZE}')`, 1100);
          if (tab === 'status') {
            const paged = await s.eval(() => { const t = __game.top?.tabs?.status; return !!(t && typeof t.setPage === 'function' && t.pageCount?.() > 1); });
            if (paged) await measure(s, vp, group, 'menu_status_p2', '(__game.top.tabs.status.setPage(1),0)', 700);
          }
        }
        await suite.errors({ id: `menu.${vp}.errors`, group }, s);
        await s.close();
        continue;
      }
      const s = await env.page(vp, VISIT_BASE[group], { settings });
      await s.wait(/scene=/.test(VISIT_BASE[group]) ? 2500 : 1500);
      if (/scene=stage/.test(VISIT_BASE[group])) {
        await s.skipDialogue();
        if (VIEWPORTS[vp].touch) await ensureTouchMode(new Touch(s.cdp, s.page), s.page);
      }
      await installTapRecorder(s.page);
      for (const [name, ev, wait] of GROUPS[group]) await measure(s, vp, group, name, ev, wait);
      await suite.errors({ id: `${group}.${vp}.errors`, group }, s);
      await s.close();
    }
  }, env);
} catch (e) {
  await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; });
} finally {
  await env.close();
}

// ── 표 + 기준선 ──
const f = (v) => (v == null ? '–' : Number(v).toFixed(1));
const lines = [
  `# 글자 크기 감사 — textSize '${SIZE}'${UI != null ? `, uiScale ${UI}` : ''} (${new Date().toISOString().slice(0, 16)})`,
  '',
  '| vp | 화면 | uiK | 하한(UI px) | n (레이어) | 최소 | p10 | 중앙값 | <12 | 기준 최소/p10/중앙값 | 가장 작은 글자 |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
];
for (const r of rows) {
  const b = baseFor(r.vp, r.scene);
  const sm = r.smallest.slice(0, 2).map((x) => `${String(x.s).replace(/\|/g, '/')}@${x.css}${x.src ? ` (${x.src})` : ''}`).join('; ');
  lines.push(`| ${r.vp} | ${r.scene} | ${r.uiScale && r.uiK != null ? Number(r.uiK).toFixed(2) : '–'} | ${r.uiScale && r.floor != null ? f(r.floor) : '–'} | ${r.n} (${r.nLayer}) | ${f(r.min)} | ${f(r.p10)} | ${f(r.median)} | ${r.under12 == null ? '–' : Math.round(r.under12 * 100) + '%'} | ${b ? `${f(b.min)}/${f(b.p10)}/${f(b.median)}` : '–'} | ${sm} |`);
}
const md = lines.join('\n') + '\n';
console.log('\n' + md);
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(path.join(REPORT_DIR, `text_audit_${SIZE}${UI != null ? '_ui' + UI : ''}.md`), md);
fs.writeFileSync(path.join(REPORT_DIR, `text_audit_${SIZE}${UI != null ? '_ui' + UI : ''}.rows.json`), JSON.stringify(rows, null, 1));
if (A.md && A.md !== true) fs.writeFileSync(path.resolve(String(A.md)), md);
if (A.update && UI == null) {
  const out = { note: base.note ?? 'benchmark #7 text-size ratchet: effective CSS px (game canvas + baked layers) per screen; written by tools/qa/text_audit.mjs --update', ...base };
  out[SIZE] = out[SIZE] ?? {};
  for (const r of rows) {
    if (r.error || !r.n) continue;
    (out[SIZE][r.vp] ??= {})[r.scene] = { min: r.min, p10: r.p10, median: r.median, under12: r.under12 };
  }
  fs.writeFileSync(RATCHET, JSON.stringify(out, null, 1) + '\n');
  console.log(`baseline '${SIZE}' written → ${path.relative(ROOT, RATCHET)}`);
}
process.exit(await suite.finish());
