// v2 — 효과(fx)의 소리 사건 ↔ 소리 표(feel) 맞물림 검사 (브라우저 없이 node 로). docs/v2/FX.md §11 · docs/v2/SOUND_FEEL.md 검수
//   node tools/v2/fx_sound_link.mjs      → 실패하면 종료 코드 1
// 보는 것: ① 효과 프리셋이 내는 사건 이름이 모두 다리(src/v2/feel/fxbridge.js FX_SOUND)에 있는가 ② 다리가 가리키는 소리 이름이 소리 표·v1 효과음에 있는가
//          ③ 다리를 가짜 소리 창구에 물려 프리셋의 사건을 전부 흘려 보냈을 때 소리 호출이 한 번씩 나가는가 ④ strike() 가 무기·재질·세기를 그대로 넘기는가
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESET_LIST, PRESET_IDS } from '../../src/v2/fx/presets.js';
import { EVENTS, FLAG, hitFeel, WEAPONS, STRENGTHS } from '../../src/v2/feel/table.js';
import { FX_SOUND, bindFxSound, checkFxSound, hitPreset } from '../../src/v2/feel/fxbridge.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fails = []; const ok = (m) => console.log('  ✓ ' + m); const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const fxEvents = [...new Set(PRESET_LIST.flatMap((p) => p.sfx))];
const v1 = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'assets/audio/sfx_v2/index.json'), 'utf8')).sfx);

const direct = fxEvents.filter((n) => Object.hasOwn(EVENTS, n));
console.log(`효과 사건 ${fxEvents.length}개 · 소리 표 사건 ${Object.keys(EVENTS).length}개 · 이름이 그대로 같은 것 ${direct.length}개 (${direct.join(' ')})`);
const bad = checkFxSound(fxEvents, v1);
bad.length ? bad.forEach(fail) : ok(`효과 사건 ${fxEvents.length}개가 모두 다리 표에 있고, 가리키는 소리가 실제로 있다`);
const extra = Object.keys(FX_SOUND).filter((n) => !fxEvents.includes(n));
extra.length ? fail('다리 표에만 있는 이름(효과가 내지 않음): ' + extra.join(' ')) : ok('다리 표에 남는 이름 없음');
const kinds = { hit: 0, ev: 0, swing: 0, step: 0, v1: 0, mute: 0 }, approx = [];
for (const n of fxEvents) { const m = FX_SOUND[n]; if (!m) continue; kinds[m.k]++; if (m.approx) approx.push(`${n} → ${m.name}×${m.pitch}`); }
console.log(`  종류: 타격 ${kinds.hit} · 표의 사건 ${kinds.ev} · 휘두름 ${kinds.swing} · 발소리 ${kinds.step} · v1 효과음 ${kinds.v1} · 일부러 무음 ${kinds.mute}`);
console.log(`  전용 소리가 없어 빌려 쓴 것 ${approx.length}개: ${approx.join(' · ')}`);

// 가짜 소리 창구
const calls = []; const feel = {
  hit: (w, m, s, f, p) => { calls.push(['hit', w, m, s, f, p.x, p.y, p.z]); return hitFeel(w, m, s, f); },
  play: (n, p, v, pi) => { calls.push(['play', n, v, pi]); return EVENTS[n] ?? null; },
  swing: (w, s) => { calls.push(['swing', w, s]); return {}; }, step: (sp) => { calls.push(['step', sp]); return {}; },
  setTimeScale: (s) => calls.push(['ts', s]), sound: { host: { sfx: (n, o) => calls.push(['v1', n, o.vol]) } },
};
const B = bindFxSound(feel);
for (const n of fxEvents) { const c0 = calls.length; B.onEvent(n, 1, 2, 3, 1); const made = calls.length - c0, want = FX_SOUND[n].k === 'mute' ? 0 : 1; if (made !== want) fail(`${n}: 소리 호출 ${made}번 (기대 ${want})`); }
B.onEvent('no.such.event', 0, 0, 0, 1); if (B.unknown !== 1) fail('모르는 사건을 세지 않는다');
ok('사건마다 소리 호출이 정확히 한 번 (무음으로 정한 2개는 0번), 모르는 이름은 조용히 넘긴다');
// strike: 무기 6 × 세기 4 × (보통 · 치명 · 막기 · 쳐내기 · 마무리) → 프리셋이 있고, 소리 호출이 넘긴 값 그대로 한 번
let n = 0;
const fx = { playAt(id, x, y, z, dx, dz, pow) { const p = PRESET_LIST[id]; const ev = p.name === 'hit.guard' ? (pow > 1.2 ? 'hit.parry' : 'hit.guard') : p.sfx[0]; B.onEvent(ev, x, y, z, 1); if (p.name === 'hit.finisher') B.onEvent('feel.slowmo', x, y, z, 1); } };
for (const w of WEAPONS) for (const s of STRENGTHS) for (const fl of [0, FLAG.crit, FLAG.guard, FLAG.parry, FLAG.finisher | FLAG.kill, FLAG.kill]) {
  const name = hitPreset(w, s, fl); if (PRESET_IDS[name] === undefined) { fail(`hitPreset(${w},${s},${fl}) → 없는 프리셋 ${name}`); continue; }
  const c0 = calls.length; const r = B.strike(fx, w, 'bone', s, fl, 10, 60, 20, 1, 0); const c = calls.slice(c0); n++;
  if (c.length !== 1 || c[0][0] !== 'hit' || c[0][1] !== w || c[0][2] !== 'bone' || c[0][3] !== s) fail(`strike(${w},${s},${fl}): 소리 호출이 ${JSON.stringify(c)}`);
  else if ((fl & FLAG.parry) && !(c[0][4] & FLAG.parry)) fail(`strike(${w},${s},parry): 쳐내기 플래그가 빠짐`);
  else if (c[0][4] !== fl && !(fl & (FLAG.guard | FLAG.parry))) fail(`strike(${w},${s},${fl}): flags ${c[0][4]}`);
  if (!r || !(r.stop >= 0)) fail(`strike(${w},${s},${fl}): 레시피를 돌려주지 않음`);
}
ok(`strike() ${n}가지 조합: 프리셋이 있고 소리는 넘긴 무기·재질·세기로 한 번씩`);
// sync: 느린 화면 값이 바뀔 때만
const c0 = calls.length; const f2 = { feel: { slowT: 0, slowScale: 1 } }; B.sync(f2); B.sync(f2); f2.feel.slowT = 0.2; f2.feel.slowScale = 0.25; B.sync(f2); B.sync(f2); f2.feel.slowT = 0; B.sync(f2); B.sync(null);
const ts = calls.slice(c0).map((c) => c[1]).join(','); ts === '0.25,1' ? ok('sync: 느린 화면이 걸릴 때와 풀릴 때만 소리 배속을 바꾼다 (0.25 → 1)') : fail('sync 호출이 ' + ts);

// 두 표의 타격 연출값 비교 (참고 — 실패 조건 아님)
const FX_FEEL = { 'hit.slash.light': [0.05, 0.10, 3], 'hit.slash.heavy': [0.10, 0.24, 8], 'hit.blunt': [0.10, 0.28, 8], 'hit.pierce': [0.06, 0.12, 5], 'hit.crit': [0.133, 0.30, 8], 'hit.guard': [0.07, 0.14, 4], 'hit.finisher': [0.133, 0.5, 12] };
console.log('\n타격 연출값: 효과 프리셋(화면이 실제로 쓰는 값) vs 소리 표의 추천값(뼈 재질) — 멈춤 초 · 흔들림 · 밀림');
for (const [name, v] of Object.entries(FX_FEEL)) { const m = FX_SOUND[name], r = hitFeel(m.weapon, 'bone', m.strength, m.flags); console.log(`  ${name.padEnd(16)} 효과 ${v[0].toFixed(3)} · ${v[1].toFixed(2)} · ${String(v[2]).padStart(2)}   표 ${r.stop.toFixed(3)} · ${r.shake.toFixed(2)} · ${String(r.kick).padStart(2)}${r.slow ? `  (표의 느린 화면 ${r.slow[0]}초 × ${r.slow[1]}배)` : ''}`); }

console.log(fails.length ? `\n실패 ${fails.length}건` : '\n맞물림 검사 통과'); process.exit(fails.length ? 1 : 0);
