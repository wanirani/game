// 예전 동작 트리 만들기 (MOTION-FEEL 비교 녹화용): 지금 작업 트리의 실행 파일(index.html, src, css, …)을 복사하고
// MOTION 패키지 파일만 기준 커밋(--rev, 기본 /tmp/claude-0/s3/motion/base_rev.txt)의 내용으로 되돌린다. 에셋은 심볼릭 링크.
// node tools/qa/motion_oldtree.mjs [--dst /dev/shm/motion_old] [--rev <sha>]
// → 그 폴더를 tools/qa/motion_capture.mjs --root 로 넘긴다 (다른 패키지의 변경은 그대로 — 동작 차이만 비교)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dst = path.resolve(opt('dst', '/dev/shm/motion_old'));
const revFile = '/tmp/claude-0/s3/motion/base_rev.txt';
const rev = opt('rev', fs.existsSync(revFile) ? fs.readFileSync(revFile, 'utf8').trim() : 'HEAD');
const OWNED = [
  'src/render/hero.js', 'src/render/hero_puppet.js', 'src/render/hero_gait.js', 'src/render/puppet_mesh.js',
  'src/render/hitfx.js', 'src/core/particles.js', 'src/game/feel_move.js', 'src/data/feel_move.js', 'src/data/feel_hit.js',
];
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const name of ['index.html', 'manifest.webmanifest', 'sw.js', 'robots.txt']) if (fs.existsSync(path.join(REPO, name))) fs.copyFileSync(path.join(REPO, name), path.join(dst, name));
for (const dir of ['src', 'css']) fs.cpSync(path.join(REPO, dir), path.join(dst, dir), { recursive: true });
for (const link of ['assets', 'node_modules']) fs.symlinkSync(path.join(REPO, link), path.join(dst, link));
const reverted = [];
for (const f of OWNED) {
  try {
    const body = execFileSync('git', ['-C', REPO, 'show', `${rev}:${f}`], { maxBuffer: 64 << 20 });
    fs.writeFileSync(path.join(dst, f), body);
    reverted.push(f);
  } catch (e) { console.error('skip', f, e.message.split('\n')[0]); }
}
console.log(JSON.stringify({ dst, rev, reverted }));
