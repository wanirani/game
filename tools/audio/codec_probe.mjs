// 게임의 AAC .m4a(효과음 v2·옛 샘플·음악)를 브라우저가 실제로 푸는지 확인: canPlayType + decodeAudioData (리샘플 없이)
//   node tools/audio/codec_probe.mjs [chromium|firefox|webkit] [--exe 경로]   (PLAYWRIGHT_BROWSERS_PATH 로 받은 브라우저)
// 주의: playwright 번들 Chromium 은 특허 코덱(AAC)을 빼고 빌드돼 실패가 정상이다 — Chrome·Android WebView·Edge 는 AAC 를 푼다.
import pw from 'playwright-core';
import { start } from '../serve.mjs';
const kind = process.argv[2] || 'firefox';
const exe = process.argv.includes('--exe') ? process.argv[process.argv.indexOf('--exe') + 1] : undefined;
const srv = await start(0), port = srv.address().port;
const out = { browser: kind };
try {
  const browser = await pw[kind].launch(exe ? { executablePath: exe } : {});
  out.version = browser.version();
  const page = await browser.newPage();
  await page.route('**/__probe__.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>p</title>' }));
  await page.goto(`http://localhost:${port}/__probe__.html`);
  Object.assign(out, await page.evaluate(async () => {
    const a = document.createElement('audio');
    const r = { canPlay: a.canPlayType('audio/mp4; codecs="mp4a.40.2"') || '(빈 문자열)', files: {} };
    const ix = await (await fetch('/assets/audio/sfx_v2/index.json')).json();
    const ids = [Object.keys(ix.files)[0], 'ult_impact_1', 'whip_1', 'menu_move_1'].filter((x) => ix.files[x]);
    const urls = ids.map((id) => `/assets/audio/sfx_v2/${id}.m4a`);
    const old = await (await fetch('/assets/audio/sfx/index.json')).json();
    urls.push(`/assets/audio/sfx/${Object.keys(old.files)[0]}.m4a`, '/assets/audio/music/victory.m4a');
    const ctx = new OfflineAudioContext(2, 1, 48000);
    for (const u of urls) {
      try {
        const ab = await (await fetch(u)).arrayBuffer();
        const b = await ctx.decodeAudioData(ab);
        let pk = 0; for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) pk = Math.max(pk, Math.abs(v));
        r.files[u] = `ok ${b.duration.toFixed(3)} s ${b.numberOfChannels} ch peak ${(20 * Math.log10(pk)).toFixed(2)} dBFS`;
      } catch (e) { r.files[u] = 'FAIL ' + (e && e.name || e); }
    }
    return r;
  }));
  await browser.close();
} catch (e) { out.err = String(e.message || e).split('\n')[0]; }
srv.close();
console.log(JSON.stringify(out, null, 1));
