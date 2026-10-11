// 헤드리스 Chromium(playwright 번들)은 AAC 를 못 푼다 (canPlayType('audio/mp4') = '', decodeAudioData EncodingError) — 게임은 효과음·음악을 .m4a 로만
// 싣는다. QA 페이지에서는 assets/audio/**.m4a 요청을 ffmpeg 로 같은 내용의 WAV(16-bit PCM, 원래 rate·채널)로 바꿔 돌려주고
// window.__BN_AUDIO_CODECS = ['m4a'] 로 코덱 검사를 통과시킨다. 실제 기기(Chrome/WebView·Safari·Firefox)는 m4a 를 그대로 푼다
// (tools/audio/codec_probe.mjs 로 확인). 응답 헤더 x-orig-bytes = 원래 m4a 크기 (용량 검사용).
//   import { routeM4a } from './audio/m4a_route.mjs';  await routeM4a(contextOrPage, rootDir);
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const cache = new Map();
export function m4aToWav(file) {
  if (cache.has(file)) return cache.get(file);
  const wav = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'], { maxBuffer: 1 << 28 });
  const v = { wav, orig: fs.statSync(file).size };
  cache.set(file, v);
  return v;
}
export async function routeM4a(target, root) {
  await target.addInitScript(() => { window.__BN_AUDIO_CODECS = ['m4a']; });
  await target.route(/\/assets\/audio\/.+\.m4a(\?.*)?$/, (r) => {
    const u = new URL(r.request().url());
    const file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(path.join(root, 'assets', 'audio')) || !fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
    try {
      const { wav, orig } = m4aToWav(file);
      return r.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'x-orig-bytes': String(orig), 'access-control-expose-headers': 'x-orig-bytes' }, body: wav });
    } catch (e) { return r.fulfill({ status: 500, body: String(e.message || e) }); }
  });
}
