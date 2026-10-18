// 「숨쉬는 원경」 (Stage 5 P2) 검사: src/data/atmos.js · src/render/atmos.js · render/background.js 훅 · render/tiles.js 창문/바닥.
//
//   node tools/test_atmos.mjs              노드만 (빠름): 데이터 형식, 원경 id 전부에 항목, 모듈 로드, 대체 경로
//   node tools/test_atmos.mjs --browser    + 브라우저 (fold_open, 스크린샷 없음): 스테이지마다 오류 0, 단계별 그리기 수,
//        [--stages s01,s11,s16,hub | --all]  앞 안개 알파 ≤ 0.18, 동작 줄이기 25 %, 항목 없는 원경 조용히 끔, 구운 바이트 ≤ 1.5 MB
// 종료 코드 1 = 실패 있음.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { fails++; console.log('  ✗ ' + msg); } };

const { ATMOS } = await import(path.join(ROOT, 'src/data/atmos.js'));
const { STAGES } = await import(path.join(ROOT, 'src/data/stages.js'));
const { TOWN_STAGE } = await import(path.join(ROOT, 'src/data/town.js'));

console.log('[1] 원경 id 마다 항목 (render/background.js 가 불러올 수 있는 그림: 스테이지·방·마을)');
const ids = new Set();
for (const st of [...Object.values(STAGES), TOWN_STAGE]) {
  if (st?.bg) ids.add(st.bg);
  for (const r of Object.values(st?.rooms || {})) if (typeof r?.bg === 'string' && r.bg) ids.add(r.bg);
}
const missing = [...ids].filter((k) => !ATMOS[k]);
ok(ids.size >= 22, `원경 id ${ids.size}개 찾음 (${[...ids].sort().join(', ')})`);
ok(missing.length === 0, `항목 없는 원경 id: ${missing.join(', ') || '없음'}`);
const files = new Set(fs.readdirSync(path.join(ROOT, 'assets/bg')).filter((f) => f.endsWith('.webp')).map((f) => 'bg/' + f.replace(/\.webp$/, '')));
const stale = Object.keys(ATMOS).filter((k) => !files.has(k));
ok(stale.length === 0, `그림 파일이 없는 항목: ${stale.join(', ') || '없음'}`);

console.log('[2] 데이터 형식');
const HEX = /^#[0-9a-f]{6}$/i, RGBA = /^rgba\(\d+,\d+,\d+,[\d.]+\)$/;
const bad = [];
let nLights = 0, nFeed = 0;
for (const [k, e] of Object.entries(ATMOS)) {
  if (!Array.isArray(e.lights)) { bad.push(`${k} lights`); continue; }
  for (const l of e.lights) {
    nLights++; if (l.feed) nFeed++;
    if (!(l.u >= 0 && l.u <= 1 && l.v >= 0 && l.v <= 1)) bad.push(`${k} u/v ${l.u},${l.v}`);
    if (!(l.r > 0 && l.r <= 0.4)) bad.push(`${k} r ${l.r}`);
    if (!HEX.test(l.color)) bad.push(`${k} color ${l.color}`);
    if (!(l.flicker >= 0 && l.flicker <= 1)) bad.push(`${k} flicker ${l.flicker}`);
  }
  const f = e.fog || {};
  if (!(f.near >= 0 && f.near <= 0.18)) bad.push(`${k} fog.near ${f.near} (≤ 0.18)`);
  if (!(f.far >= 0 && f.far <= 0.35)) bad.push(`${k} fog.far ${f.far}`);
  if (!HEX.test(f.color || '')) bad.push(`${k} fog.color`);
  if (e.rays) {
    const r = e.rays;
    if (!(r.u >= 0 && r.u <= 1 && r.v >= 0 && r.v <= 1 && r.len > 0 && r.w > 0 && r.a > 0 && r.a <= 0.3 && HEX.test(r.color))) bad.push(`${k} rays`);
  }
  if (!(Array.isArray(e.windowTint) && e.windowTint.length === 3 && e.windowTint.every((t) => RGBA.test(t)))) bad.push(`${k} windowTint`);
}
ok(bad.length === 0, `항목 ${Object.keys(ATMOS).length}개, 빛 ${nLights}개 (플레이 층 광원 후보 ${nFeed}) — 문제: ${bad.slice(0, 8).join(' · ') || '없음'}`);

console.log('[3] 노드에서 모듈 로드 (그리기 없이)');
try {
  const A = await import(path.join(ROOT, 'src/render/atmos.js'));
  ok(typeof A.createAtmos === 'function' && typeof A.atmosEntry === 'function', 'render/atmos.js 로드');
  ok(A.createAtmos({ bg: 'bg/s01_village' }) === null, '문서(document)가 없으면 createAtmos → null (던지지 않음)');
  ok(A.createAtmos({ bg: 'bg/__none__' }) === null && A.atmosEntry('bg/__none__') === null, '항목 없는 원경 → null (조용히 끔)');
  ok(A.atmosWindowTint('bg/s11_chapel')?.length === 3 && A.atmosWindowTint(null) === null, 'atmosWindowTint');
  ok(A.atmosLegacy() === false, '?atmos=0 아님 → atmosLegacy false');
  await import(path.join(ROOT, 'src/render/background.js'));
  ok(true, 'render/background.js 로드');
} catch (e) { ok(false, '모듈 로드: ' + e.message); }

if (flag('browser')) {
  console.log('[4] 브라우저 (fold_open, 고정 스텝, 스크린샷 없음)');
  const { openEnv } = await import('./qa/lib/server.mjs');
  const { freeze, step } = await import('./qa/lib/step.mjs');
  const { gotoRoom } = await import('./qa/lib/rooms.mjs');
  const all = flag('all');
  const list = all ? [...Object.keys(STAGES).filter((s) => /^s\d\d$/.test(s) || s === 'arena'), 'hub'] : String(opt('stages', 's01,s11,s16,hub')).split(',');
  const env = await openEnv();
  try {
    const s = await env.page('fold_open', 'index.html?scene=stage&stage=s01&room=r1', { settings: { quality: 'medium' } });
    await s.waitGame('!!g.world?.player');
    await freeze(s.page);
    const setTier = (q) => s.eval((q) => { const g = window.__game; g.autoQualityOn = () => false; g._tier = q; g.world?.applyQuality?.(); }, q);
    for (const id of list) {
      if (id === 'hub') {
        await s.eval(() => window.__game.go('hub', {}, { fade: false }));
        for (let i = 0; i < 60; i++) { const ok2 = await s.eval(() => window.__game.world?.mode === 'town' && !!window.__game.world?.player); if (ok2) break; await step(s.page, 2, false); await s.wait(100); }
      } else await gotoRoom(s, id, STAGES[id]?.start ?? 'r1');
      const r = {};
      for (const q of ['low', 'medium', 'high']) {
        await setTier(q);
        await step(s.page, 30, true);
        r[q] = await s.eval(() => {
          const w = window.__game.world, a = w?.bg?.atmos;
          if (!a) return { none: true, key: w?.bg?.stage?.bg ?? null };
          let draws = 0, fed = 0;
          for (let i = 0; i < 20; i++) { window.__qaStep(1, true); draws = Math.max(draws, a.stats.draws); fed = Math.max(fed, a.stats.fed); }
          return { draws, fed, tier: a.tier, baked: a.baked, key: a.key };
        });
      }
      const tl = await s.eval(() => { const w = window.__game.world, t = w?.tiles; return { tint: t?.windowTint?.()?.[0] ?? null, ao: !!t?.aoCanvas, theme: w?.bg?.stage?.theme, bg: w?.bg?.stage?.bg }; });
      if (id === 's11') ok(/^rgba\(255,72,84/.test(tl.tint || ''), `s11 창문 빛깔 = 예배당 붉은 빛 (${tl.tint})`);
      ok(tl.ao, `${id} 바닥 안착 띠 구움 (${tl.theme})`);
      const e = r.medium;
      if (e.none) { ok(!ATMOS[e.key], `${id}: 원경 층 없음 (${e.key} 항목 ${ATMOS[e.key] ? '있는데 꺼짐' : '없음 → 조용히 끔'})`); continue; }
      ok(r.low.draws === 0 && r.low.fed === 0, `${id} 낮음: 그리기 ${r.low.draws}, 광원 ${r.low.fed} (0 이어야)`);
      ok(r.medium.draws <= 2 && r.medium.draws + 2 * r.medium.fed <= 4, `${id} 중간: 이 층 drawImage ${r.medium.draws} + 광원 ${r.medium.fed}×2 = ${r.medium.draws + 2 * r.medium.fed} (≤ 4)`);
      ok(r.high.draws <= 4, `${id} 높음: 이 층 drawImage ${r.high.draws} (≤ 4) + 광원 ${r.high.fed}`);
    }
    // 앞 안개 알파 상한: 구운 스프라이트의 최대 알파 × fog.near (보스전이면 × 0.55) ≤ 0.18
    const fogMax = await s.eval(async () => {
      const A = await import('/src/render/atmos.js');
      const w = window.__game.world, a = w?.bg?.atmos;
      const out = { bytes: A.atmosBytes(), near: a?.e?.fog?.near ?? 0, spriteMax: 0 };
      const { fog, fogH } = A.atmosCanvases();
      if (fog?.width) {
        const d = fog.getContext('2d').getImageData(0, fogH, fog.width, fogH).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > out.spriteMax) out.spriteMax = d[i];
      }
      return out;
    });
    ok(fogMax.spriteMax / 255 * fogMax.near <= 0.18, `앞 안개 화면 알파 최대 ${(fogMax.spriteMax / 255 * fogMax.near).toFixed(3)} (스프라이트 ${fogMax.spriteMax}/255 × near ${fogMax.near}, ≤ 0.18)`);
    ok(fogMax.bytes > 0 && fogMax.bytes <= 1.5 * 1048576, `구운 스프라이트 ${(fogMax.bytes / 1048576).toFixed(2)} MB (≤ 1.5 MB)`);
    // 동작 줄이기: 같은 스텝 수에 시간이 25 % 로
    const rm = await s.eval(() => {
      const g = window.__game, a = g.world?.bg?.atmos;
      if (!a) return null;
      const t0 = a.t; window.__qaStep(60, false); const d1 = a.t - t0;
      const old = g.settings.reduceMotion; g.settings.reduceMotion = true;
      const t1 = a.t; window.__qaStep(60, false); const d2 = a.t - t1;
      g.settings.reduceMotion = old;
      return d2 / Math.max(1e-6, d1);
    });
    ok(rm !== null && rm <= 0.26, `동작 줄이기: 일렁임·흐름 빠르기 ${rm === null ? '?' : (rm * 100).toFixed(0)} % (≤ 25 %)`);
    ok(s.errs.length === 0, `페이지 오류 ${s.errs.length}건${s.errs.length ? ': ' + s.errs.slice(0, 3).join(' | ') : ''}`);
  } finally { await env.close(); }
}
console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 모두 통과');
process.exit(fails ? 1 : 0);
