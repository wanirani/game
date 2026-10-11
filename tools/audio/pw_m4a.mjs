// node --import ./tools/audio/pw_m4a.mjs tools/integration.mjs …  → 헤드리스 Chromium 의 모든 컨텍스트에서 assets/audio/**.m4a 를
// 같은 내용의 WAV 로 돌려주고 window.__BN_AUDIO_CODECS=['m4a'] (번들 Chromium 은 AAC 를 못 푼다 — 실제 기기는 m4a 를 그대로 푼다).
// 이것 없이 돌리면 게임은 코덱 검사에서 녹음 효과음·음악을 끄고 합성음만 쓴다 (오류는 아님).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from 'playwright-core';
import { routeM4a } from './m4a_route.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await orig(...a);
  const nc = b.newContext.bind(b);
  b.newContext = async (...o) => { const c = await nc(...o); await routeM4a(c, root); return c; };
  const np = b.newPage.bind(b);
  b.newPage = async (...o) => { const p = await np(...o); await routeM4a(p, root); return p; };
  return b;
};
