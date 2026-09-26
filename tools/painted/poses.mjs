// 포즈 갤러리: 실제 게임에서 보스 상태기계를 돌려 상태별 스크린샷 → 한 장의 시트로 합친다.
// 사용: node tools/painted/poses.mjs <bossId> [--vector] [--mobile] [--dpr 1.5] [--only idle,hit] [--out 폴더] [--debug]
//   --vector : ?painted=0 (기존 벡터 그림) — 같은 포즈를 나란히 비교할 때
//   --debug  : 판정(청록)·컬링 영역(자홍 점선) 표시
// 포즈 목록/설치 코드: tools/painted/poses/<bossId>.mjs (POSES, INSTALL, STAGE)
// 출력: <out>/<P|V>[m]_<pose>.png + <out>/sheet_<P|V>[m].jpg   (기본 out = /tmp/claude-0/painted/poses_<bossId>)
import { open, startFight, freeze, seedRandom, waitPainted } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const id = argv[0];
if (!id) { console.log('usage: node tools/painted/poses.mjs <bossId> [--vector] [--mobile] [--only a,b]'); process.exit(1); }
const flag = (k) => argv.includes('--' + k);
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const vector = flag('vector'), mobile = flag('mobile'), debug = flag('debug');
const only = val('only', null)?.split(',');
const out = val('out', `/tmp/claude-0/painted/poses_${id}`);
fs.mkdirSync(out, { recursive: true });
const mod = await import(`./poses/${id}.mjs`);
const url = `index.html?scene=stage&stage=${mod.STAGE}&room=boss${vector ? '&painted=0' : ''}${debug ? '&debug' : ''}`;
const s = await open({ url, mobile, dpr: +(val('dpr', mobile ? 2 : 1.5)) });
await startFight(s.page);
if (!vector) console.log('bake', JSON.stringify(await waitPainted(s.page, id)));
await seedRandom(s.page);
await freeze(s.page);
if (debug) await s.page.evaluate(() => { window.__game.debug = true; });
await s.page.evaluate(mod.INSTALL);
const tag = (vector ? 'V' : 'P') + (mobile ? 'm' : '');
const files = [];
for (const name of mod.POSES) {
  if (only && !only.includes(name)) continue;
  const info = await s.page.evaluate((n) => window.__pose(n), name);
  const f = path.join(out, `${tag}_${name}.png`);
  await s.page.screenshot({ path: f });
  files.push([f, name]);
  console.log(name.padEnd(13), JSON.stringify(info));
}
console.log(s.errors.join('\n') || 'NO ERRORS');
await s.close();
// 시트 (python PIL)
const py = `
import sys
from PIL import Image, ImageDraw
files = sys.argv[2:]
cols = 4; tw = 480
ims = [Image.open(f).convert('RGB') for f in files[0::2]]
th = int(ims[0].height * tw / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sh = Image.new('RGB', (cols * tw, rows * (th + 18)), (0, 0, 0)); d = ImageDraw.Draw(sh)
for i, (im, name) in enumerate(zip(ims, files[1::2])):
    x, y = (i % cols) * tw, (i // cols) * (th + 18)
    sh.paste(im.resize((tw, th)), (x, y)); d.text((x + 4, y + th + 3), name, fill=(255, 255, 0))
sh.save(sys.argv[1], quality=88)
`;
if (files.length) {
  const sheet = path.join(out, `sheet_${tag}.jpg`);
  execFileSync('python3', ['-c', py, sheet, ...files.flat()]);
  console.log(sheet);
}
