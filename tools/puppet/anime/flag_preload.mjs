// 애니풍 시범: 남의 QA 도구(고칠 수 없는 파일)를 플래그 켠 채로 돌리는 미리 불러오기 모듈.
//   node --import ./tools/puppet/anime/flag_preload.mjs tools/qa/perf_budget.mjs --profiles desk,phone1low --quick
// playwright-core 의 chromium.launch 를 감싸, 새 브라우저 컨텍스트마다 localStorage 'bn.anime'='1' (src/core/pilot_flags.js) 을
// 페이지 스크립트보다 먼저 넣는다. PILOT_FLAGS='anime,sfx2' 처럼 고를 수 있다 (기본 anime).
import { chromium } from 'playwright-core';
const want = String(process.env.PILOT_FLAGS || 'anime').split(',').map((s) => s.trim());
const KV = { anime: ['bn.anime', '1'], sfx2: ['bn.sfx', 'v2'] };
const pairs = want.map((k) => KV[k]).filter(Boolean);
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
  const b = await launch(...a);
  const newContext = b.newContext.bind(b);
  b.newContext = async (...o) => {
    const ctx = await newContext(...o);
    await ctx.addInitScript((pairs) => { try { for (const [k, v] of pairs) localStorage.setItem(k, v); } catch { /* 저장소 막힘 */ } }, pairs);
    return ctx;
  };
  return b;
};
console.error(`[flag_preload] pilot flags on: ${pairs.map((p) => p.join('=')).join(', ')}`);
