// v2 animlib: docs/v2/ANIM_LIBRARY.md 의 표 두 개를 목록(animlib_spec.mjs)과 만든 결과(index.json)에서 다시 채운다.
//   node tools/v2/animlib_table.mjs          (<!-- AL:clips --> … <!-- /AL:clips --> 와 <!-- AL:why --> … <!-- /AL:why --> 사이를 바꿔 쓴다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS, GROUPS, GROUP_KO } from './animlib_spec.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const doc = path.join(root, 'docs/v2/ANIM_LIBRARY.md');
const index = JSON.parse(fs.readFileSync(path.join(root, 'assets/v2/char3d/clips/index.json'), 'utf8'));
const by = new Map(index.clips.map((c) => [c.n, c]));
const EV = { footL: '왼발', footR: '오른발', swing: '휘두름', hit: '타격', charge: '모음', release: '터뜨림', body: '몸이 닿음', land: '착지', takeoff: '도약', grab: '잡음', scream: '비명', hurt: '맞음', guard: '막음', pull: '당김' };
let a = '', b = '';
for (const g of GROUPS) {
  const rows = CLIPS.filter((c) => c.g === g && by.has(c.n)); if (!rows.length) continue;
  const gi = index.groups.find((x) => x.g === g);
  a += `\n**${GROUP_KO[g]}** — \`${gi.file}\` · ${rows.length}개 · ${(gi.bytes / 1024).toFixed(0)} KB\n\n| 이름 | 쓰임 | 원본 (번호) | 순환 | 길이 | 권장 배속 | 이벤트 (초) | 뺀 이동 (m) |\n|---|---|---|---|---|---|---|---|\n`;
  b += `\n**${GROUP_KO[g]}**\n\n| 이름 | 원본 (번호) | 고른 까닭 | 버린 후보 |\n|---|---|---|---|\n`;
  for (const c of rows) {
    const m = by.get(c.n), ev = m.ev.map((e) => `${EV[e[1]] ?? e[1]} ${e[0]}`).join(' · ') || '—';
    const src = `${m.src} (${m.id})${m.rev ? ' 거꾸로' : ''}${m.mir ? ' 거울상' : ''}${c.own ? ' ★' : ''}`;
    a += `| \`${m.n}\` | ${c.use} | ${src} | ${m.loop ? '순환' : '한 번'} | ${m.dur.toFixed(2)}초 | ×${m.speed} | ${ev} | ${m.travel ? `앞 ${m.travel[1]} · 옆 ${m.travel[0]}` : '—'} |\n`;
    b += `| \`${m.n}\` | ${src} · ${m.cut[0]}–${m.cut[1]}초 | ${c.why} | ${c.rej} |\n`;
  }
}
let s = fs.readFileSync(doc, 'utf8');
const put = (tag, body) => { const re = new RegExp(`(<!-- AL:${tag} -->)[\\s\\S]*?(<!-- /AL:${tag} -->)`); if (!re.test(s)) throw new Error('표 자리 표시가 없습니다: ' + tag); s = s.replace(re, `$1\n${body}\n$2`); };
put('clips', a); put('why', b);
fs.writeFileSync(doc, s);
console.log(`표를 채웠습니다: 클립 ${index.clips.length}개 · ${doc}`);
