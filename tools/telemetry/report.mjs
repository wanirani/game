// 익명 통계 보고서: node tools/telemetry/report.mjs <origin> [--days 7] [--out dist/telemetry_report.html]
//                 node tools/telemetry/report.mjs --file <stats.json> [--out …]      (내려받아 둔 GET /api/stats 응답으로, 오프라인)
// <origin>/api/stats?days=N 을 받아 한 파일짜리 한국어 HTML 보고서를 만든다 (외부 파일·스크립트 없음, 밝은·어두운 화면 모두):
//  요약·날별 세션 · 많이 난 오류 · 스테이지/방별 사망 지점(방 지도 위에 표시) · 클리어 시간 백분위 · 보스 승률 · 아케이드 · 기기·성능 분포.
// 스테이지·보스·적 이름은 저장소의 src/data 에서 읽는다 (없으면 id 그대로). 설명: docs/TELEMETRY.md §5
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return dflt;
  const a = argv[i];
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1] ?? dflt;
};
const origin = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && /^--(days|out|file)$/.test(argv[i - 1])));
const file = opt('file');
const days = Number(opt('days', '7'));
const out = path.resolve(ROOT, opt('out', 'dist/telemetry_report.html'));
if (!file && !origin) {
  console.error('사용법: node tools/telemetry/report.mjs <origin> [--days 7] [--out dist/telemetry_report.html]\n        node tools/telemetry/report.mjs --file <stats.json> [--out …]');
  process.exit(2);
}
if (!Number.isInteger(days) || days < 1 || days > 30) { console.error('--days 는 1~30'); process.exit(2); }

// ── 자료 ──
let stats;
if (file) stats = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
else {
  const url = `${String(origin).replace(/\/+$/, '')}/api/stats?days=${days}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) { console.error(`${url} → ${res.status}`); process.exit(1); }
  stats = await res.json();
}
if (!stats?.ok || !stats.totals || !stats.summary) { console.error('GET /api/stats 응답 형식이 아닙니다'); process.exit(1); }

const names = { stage: {}, boss: {}, enemy: {}, rooms: {} };
try {
  const [S, B, E] = await Promise.all([import('../../src/data/stages.js'), import('../../src/data/bosses.js'), import('../../src/data/enemies.js')]);
  for (const [id, s] of Object.entries(S.STAGES ?? {})) { names.stage[id] = s.chapter ? `${s.chapter}장 ${s.name}` : s.name; names.rooms[id] = s.rooms ?? {}; }
  for (const [id, b] of Object.entries(B.BOSSES ?? {})) names.boss[id] = b.name;
  for (const [id, e] of Object.entries(E.ENEMIES ?? {})) names.enemy[id] = e.name;
} catch (e) { console.warn('게임 데이터를 읽지 못해 id 로 표시합니다:', e.message); }

const T = stats.totals, S = stats.summary;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (n) => (Number.isFinite(n) ? Number(n).toLocaleString('ko-KR') : '–');
const fmtT = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–');
const pctS = (x) => (Number.isFinite(x) ? `${Math.round(x * 1000) / 10}%` : '–');
const stageName = (id) => names.stage[id] ? `${names.stage[id]} <span class="id">${esc(id)}</span>` : esc(id);
const causeName = (c) => {
  const [k, id] = String(c).split(':');
  if (k === 'boss') return `보스 ${esc(names.boss[id] ?? id)}`;
  if (k === 'enemy') return esc(names.enemy[id] ?? id);
  return { hazard: '함정·지형', fall: '낙사', unknown: '알 수 없음' }[c] ?? esc(c);
};
const sum = (m) => Object.values(m ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

/** 막대 목록 (값 큰 순 또는 키 순). 한 계열이라 한 색, 값은 글자로 */
function bars(m, { label = (k) => esc(k), sort = 'value', limit = 12, unit = '' } = {}) {
  const ent = Object.entries(m ?? {}).filter(([, v]) => v > 0);
  if (!ent.length) return '<p class="muted">자료 없음</p>';
  ent.sort(sort === 'key' ? (a, b) => Number(a[0]) - Number(b[0]) || String(a[0]).localeCompare(String(b[0])) : (a, b) => b[1] - a[1]);
  const shown = ent.slice(0, limit), rest = ent.slice(limit), total = sum(m), max = Math.max(...shown.map(([, v]) => v));
  if (rest.length) shown.push(['__other', rest.reduce((s, [, v]) => s + v, 0)]);
  return `<div class="bars">${shown.map(([k, v]) => `<div class="bar" title="${esc(k === '__other' ? '기타' : k)}: ${fmtN(v)} (${pctS(v / total)})"><span class="bl">${k === '__other' ? '기타' : label(k)}</span><span class="bt"><span class="bf" style="width:${Math.max(1, (v / max) * 100).toFixed(1)}%"></span></span><span class="bv">${fmtN(v)}${unit} <span class="muted">${pctS(v / total)}</span></span></div>`).join('')}</div>`;
}
function table(head, rows) {
  if (!rows.length) return '<p class="muted">자료 없음</p>';
  return `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** 방 지도 (src/data 의 타일 줄) 위에 사망 칸을 원으로. 지도가 없으면 칸 좌표만 */
function roomMap(stage, room, cells) {
  const map = names.rooms[stage]?.[room]?.map;
  const pts = Object.entries(cells ?? {}).map(([k, n]) => { const [x, y] = k.split(',').map(Number); return { x, y, n }; }).filter((p) => Number.isFinite(p.x));
  if (!Array.isArray(map) || !map.length) return `<p class="muted">지도 없음 · 칸 ${pts.map((p) => `(${p.x},${p.y})×${p.n}`).join(' ')}</p>`;
  const h = map.length, w = Math.max(...map.map((r) => r.length));
  let tiles = '';
  map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === ' ' || ch === '.') { x++; continue; }
      let e = x;
      while (e < row.length && row[e] === ch) e++;
      const cls = ch === '#' ? 't' : ch === '^' ? 'tz' : 'to';
      tiles += `<rect class="${cls}" x="${x}" y="${y}" width="${e - x}" height="1"/>`;
      x = e;
    }
  });
  const max = Math.max(1, ...pts.map((p) => p.n));
  const dots = pts.sort((a, b) => a.n - b.n).map((p) => {
    const r = 0.35 + 0.8 * Math.sqrt(p.n / max);
    const cy = Math.min(h + 1, Math.max(0, p.y - 0.5));
    return `<circle class="d" cx="${p.x + 0.5}" cy="${cy}" r="${r.toFixed(2)}"><title>칸 (${p.x}, ${p.y}) · 사망 ${p.n}</title></circle>`;
  }).join('');
  return `<svg class="map" viewBox="-1 -1 ${w + 2} ${h + 3}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(stage)} ${esc(room)} 사망 지점">${tiles}${dots}</svg>`;
}

// ── 구역 ──
const daily = stats.daily ?? [];
const maxS = Math.max(1, ...daily.map((d) => d.sessions));
const dailyHtml = `<div class="days">${daily.map((d) => `<div class="day" title="${esc(d.day)} · 세션 ${d.sessions} · 사건 ${d.events} · 오류 ${d.errors} · 사망 ${d.deaths} · 클리어 ${d.clears}"><span class="dv">${fmtN(d.sessions)}</span><span class="dc"><span class="df" style="height:${((d.sessions / maxS) * 100).toFixed(1)}%"></span></span><span class="dl">${esc(d.day.slice(5))}</span></div>`).join('')}</div>`;

const tiles = [
  ['세션', T.sessions], ['사건', T.events], ['오류', T.types?.error ?? 0], ['사망', T.types?.death ?? 0],
  ['클리어', T.types?.stage_clear ?? 0], ['보스전', T.types?.boss_result ?? 0], ['아케이드', T.types?.arcade_result ?? 0],
].map(([k, v]) => `<div class="tile"><div class="tv">${fmtN(v)}</div><div class="tk">${k}</div></div>`).join('');

const errHtml = (S.topErrors ?? []).length ? (S.topErrors ?? []).map((e, i) => `
  <details class="err"${i < 3 ? ' open' : ''}><summary><span class="en">${fmtN(e.n)}회</span> <code>${esc(e.msg)}</code></summary>
  <div class="ed"><div>첫 프레임 <code>${esc(e.fr?.[0] ?? '–')}</code> · 종류 ${esc(e.kind)} · 장면 ${esc(e.scene ?? '–')} · 스테이지 ${esc(e.stage ?? '–')} · 빌드 ${esc(e.b ?? '–')} · 플랫폼 ${esc(e.plat ?? '–')} · 묶음 <code>${esc(e.sig)}</code></div>
  <pre>${(e.fr ?? []).map(esc).join('\n') || '(스택 없음)'}</pre></div></details>`).join('') : '<p class="muted">오류 없음</p>';

const deathStages = Object.entries(T.deaths ?? {}).sort((a, b) => b[1].n - a[1].n);
const deathHtml = deathStages.length ? deathStages.map(([stage, s]) => {
  const rooms = Object.entries(s.rooms ?? {}).sort((a, b) => b[1].n - a[1].n);
  return `<section class="stage"><h3>${stageName(stage)} <span class="muted">사망 ${fmtN(s.n)}</span></h3>
  <div class="two"><div><h4>원인</h4>${bars(s.causes, { label: causeName, limit: 8 })}</div>
  <div><h4>방</h4>${bars(Object.fromEntries(rooms.map(([r, x]) => [r, x.n])), { limit: 8 })}</div></div>
  ${rooms.slice(0, 4).map(([room, r]) => `<figure><figcaption>방 <b>${esc(room)}</b> · 사망 ${fmtN(r.n)} · 많은 원인 ${Object.entries(r.causes ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${causeName(c)} ${n}`).join(', ')}</figcaption>${roomMap(stage, room, r.cells)}</figure>`).join('')}
  </section>`;
}).join('') : '<p class="muted">사망 기록 없음</p>';

const clearRows = Object.values(S.clears ?? {}).sort((a, b) => String(a.stage).localeCompare(String(b.stage)) || String(a.diff).localeCompare(String(b.diff))).map((c) => [
  stageName(c.stage), esc(c.diff), fmtN(c.n), fmtN(c.starts), c.starts ? pctS(c.n / c.starts) : '–',
  fmtT(c.time?.p25), `<b>${fmtT(c.time?.p50)}</b>`, fmtT(c.time?.p75), fmtT(c.time?.p90),
  ['S', 'A', 'B', 'C', 'D'].map((r) => `${r} ${c.rank?.[r] ?? 0}`).join(' · '), c.deathsPerClear ?? '–', fmtN(c.deathless),
]);
const startOnly = Object.entries(T.starts ?? {}).filter(([k]) => !S.clears?.[k]).map(([k, n]) => { const [st, d] = k.split('|'); return [stageName(st), esc(d), '0', fmtN(n), '0%', '–', '–', '–', '–', '–', '–', '–']; });

const bossRows = Object.entries(S.bosses ?? {}).sort((a, b) => (a[1].winRate ?? 1) - (b[1].winRate ?? 1)).map(([id, b]) => [
  `${esc(names.boss[id] ?? id)} <span class="id">${esc(id)}</span>`, fmtN(b.win), fmtN(b.lose),
  `<span class="rate" title="승률 ${pctS(b.winRate)}"><span class="rf" style="width:${((b.winRate ?? 0) * 100).toFixed(1)}%"></span></span> ${pctS(b.winRate)}`, fmtT(b.medianWinSec),
]);
const arcadeRows = Object.entries(S.arcade ?? {}).map(([m, a]) => [
  esc({ survival: '서바이벌', bossrush: '보스 러시', practice: '연습' }[m] ?? m), fmtN(a.n), fmtN(a.cleared),
  `${fmtN(a.score?.p25)} / <b>${fmtN(a.score?.p50)}</b> / ${fmtN(a.score?.p90)}`, a.wave?.p50 == null ? '–' : `${a.wave.p25} / <b>${a.wave.p50}</b> / ${a.wave.p90}`,
  `${fmtT(a.time?.p25)} / <b>${fmtT(a.time?.p50)}</b> / ${fmtT(a.time?.p90)}`,
]);
const D = T.dev ?? {};
const devHtml = `<div class="grid">
  <div><h4>플랫폼</h4>${bars(D.plat, { label: (k) => esc({ web: '웹', pwa: '설치한 웹 앱', apk: '안드로이드 앱' }[k] ?? k) })}</div>
  <div><h4>운영체제</h4>${bars(D.os)}</div><div><h4>브라우저</h4>${bars(D.br)}</div>
  <div><h4>화면 (CSS px, 100 단위)</h4>${bars(D.vp, { limit: 10 })}</div><div><h4>픽셀 배율</h4>${bars(D.dpr, { sort: 'key' })}</div>
  <div><h4>CPU 코어</h4>${bars(D.cores, { sort: 'key' })}</div><div><h4>메모리 (GB)</h4>${bars(D.mem, { sort: 'key' })}</div>
  <div><h4>품질 설정</h4>${bars(D.q)}</div><div><h4>시작 품질 등급</h4>${bars(D.tier)}</div><div><h4>입력</h4>${bars(D.input, { label: (k) => esc({ touch: '터치', kb: '키보드·마우스', pad: '게임패드' }[k] ?? k) })}</div>
  <div><h4>빌드</h4>${bars(D.build, { limit: 6 })}</div></div>`;
const P = T.perf ?? {};
const perfHtml = `<p>1분 표본 ${fmtN(P.n)}개 · 평균 fps 중앙값 <b>${S.fps?.avg?.p50 ?? '–'}</b> · 하위 5 % fps 중앙값 <b>${S.fps?.p5?.p50 ?? '–'}</b> (5 fps 칸의 아래 끝)</p>
<div class="grid"><div><h4>평균 fps</h4>${bars(P.fps, { sort: 'key', limit: 30 })}</div><div><h4>하위 5 % fps</h4>${bars(P.p5, { sort: 'key', limit: 30 })}</div>
<div><h4>그때의 품질 등급</h4>${bars(P.tier)}</div><div><h4>JS 힙 (MB, 32 단위 · Chromium 만)</h4>${bars(P.heap, { sort: 'key', limit: 20 })}</div></div>`;

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>블러드 녹턴 통계</title>
<style>
:root{color-scheme:light;--bg:#fcfcfb;--card:#ffffff;--ink:#0b0b0b;--ink2:#52514e;--muted:#7a7873;--line:#e4e2dc;--track:#eeece6;--s1:#2a78d6;--hot:#e34948;--tile:#c9c6bd;--tile2:#e1ded6;--tz:#eb6834}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#141413;--card:#1a1a19;--ink:#ffffff;--ink2:#c3c2b7;--muted:#9a988f;--line:#33322f;--track:#2a2a28;--s1:#3987e5;--hot:#e66767;--tile:#4a4945;--tile2:#383734;--tz:#d95926}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#141413;--card:#1a1a19;--ink:#ffffff;--ink2:#c3c2b7;--muted:#9a988f;--line:#33322f;--track:#2a2a28;--s1:#3987e5;--hot:#e66767;--tile:#4a4945;--tile2:#383734;--tz:#d95926}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:36px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h3{font-size:15px;margin:18px 0 8px}h4{font-size:12px;margin:10px 0 6px;color:var(--ink2);font-weight:600}.muted{color:var(--muted)}.id{color:var(--muted);font-size:11px;font-family:ui-monospace,monospace}
.tiles{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.tile{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;min-width:110px}.tv{font-size:22px;font-weight:700}.tk{color:var(--ink2);font-size:12px}
.days{display:flex;gap:4px;align-items:flex-end;height:150px;overflow-x:auto;padding:4px 0}.day{display:flex;flex-direction:column;align-items:center;min-width:34px;flex:1;height:100%}
.dc{flex:1;width:60%;display:flex;align-items:flex-end;background:var(--track);border-radius:4px 4px 0 0}.df{display:block;width:100%;background:var(--s1);border-radius:4px 4px 0 0}.dv,.dl{font-size:11px;color:var(--ink2)}
.bars{display:grid;gap:3px}.bar{display:grid;grid-template-columns:minmax(80px,38%) 1fr auto;gap:8px;align-items:center;font-size:12px}.bl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt{height:10px;background:var(--track);border-radius:0 4px 4px 0}.bf{display:block;height:100%;background:var(--s1);border-radius:0 4px 4px 0}.bv{font-variant-numeric:tabular-nums;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px 24px}.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px 24px}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);white-space:nowrap}th{color:var(--ink2);font-weight:600}
.rate{display:inline-block;width:80px;height:8px;background:var(--track);border-radius:4px;vertical-align:middle;overflow:hidden}.rf{display:block;height:100%;background:var(--s1)}
.err{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:6px 0}.err summary{cursor:pointer}.en{font-weight:700;color:var(--hot)}.ed{font-size:12px;color:var(--ink2);margin-top:6px}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}pre{background:var(--track);padding:8px;border-radius:6px;overflow-x:auto;margin:6px 0 0}
.stage{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:4px 14px 12px;margin:12px 0}figure{margin:10px 0}figcaption{font-size:12px;color:var(--ink2);margin-bottom:4px}
svg.map{width:100%;height:auto;max-height:220px;background:var(--bg);border:1px solid var(--line);border-radius:6px}.t{fill:var(--tile)}.to{fill:var(--tile2)}.tz{fill:var(--tz);opacity:.6}.d{fill:var(--hot);fill-opacity:.75;stroke:var(--card);stroke-width:.15}
footer{margin-top:40px;color:var(--muted);font-size:12px}
</style></head><body><main>
<h1>블러드 녹턴 · 익명 통계 보고서</h1>
<div class="muted">${esc(stats.from)} ~ ${esc(stats.to)} (UTC, ${esc(stats.days)}일) · 만든 때 ${esc(new Date(stats.generatedAt ?? Date.now()).toISOString().replace('T', ' ').slice(0, 16))} UTC${origin ? ` · ${esc(origin)}` : ''} · 집계는 매시 한 번 (지난 시간까지)</div>
<div class="tiles">${tiles}</div>
<h2>날별 세션</h2>${dailyHtml}
<h2>많이 난 오류 (문구 + 첫 프레임으로 묶음)</h2>${errHtml}
<h2>사망 지점 (스테이지 · 방 · 칸)</h2><p class="muted">지도는 저장소의 방 타일 (회색 = 땅, 주황 = 가시). 빨간 원 = 죽은 칸 (발 위치, 클수록 많음). 방마다 많은 칸 40개까지만 모은다.</p>${deathHtml}
<h2>클리어 시간 (스테이지 · 난이도)</h2>${table(['스테이지', '난이도', '클리어', '시작', '클리어율', 'p25', '중앙값', 'p75', 'p90', '랭크', '클리어당 사망', '무사망'], [...clearRows, ...startOnly])}
<p class="muted">시간은 유효 숫자 두 자리 칸의 아래 끝 (예: 2:05 → 2:00). 클리어율 = 그 기간의 클리어 ÷ 시작 (이어하기·재도전 포함).</p>
<h2>보스 (승률 낮은 순)</h2>${table(['보스', '승', '패', '승률', '이긴 싸움 중앙 시간'], bossRows)}<p class="muted">패 = 보스전 중 사망 한 번. 시간은 보스전 시작부터.</p>
<h2>아케이드</h2>${table(['모드', '판', '클리어', '점수 p25 / 중앙 / p90', '웨이브', '시간'], arcadeRows)}
<h2>기기</h2>${devHtml}
<h2>성능 (게임 중 1분마다)</h2>${perfHtml}
<footer>개인 정보 없음: 설치·세션 번호, IP, 계정은 공개 통계에 들어 있지 않다 (docs/TELEMETRY.md).</footer>
</main></body></html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`보고서: ${path.relative(ROOT, out)} (${(html.length / 1024).toFixed(1)} KB) · 세션 ${T.sessions} · 사건 ${T.events}`);
