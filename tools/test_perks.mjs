// 직업 특성 등록부 테스트 (docs/specs/classes_t3.md §3 · §11.1 — HOOKS 가 만들고 PERKS-A..D 가 늘린다)
// 사용: node tools/test_perks.mjs [--quiet] [--no-tdz]
//  0) TDZ: 내용 모듈(class_perks_a..d)·핵심부·combat·skills·player·world 를 각각 새 node 프로세스에서 맨 먼저 혼자 불러도
//     오류 없이 끝나고, 그 뒤 skills.js 가 K 를 채우며 perksOf 가 돈다 (§3.5)
//  1) 표: 키 ⊂ CLASSES ∪ ASCENSIONS ∪ char:<영웅> · 묶음별 영웅 · 훅 이름 ⊂ HOOK_NAMES · 그 밖의 키는 only/N · 묶음 사이 키 겹침 없음 ·
//     ACTIVES = 그 묶음 비전 기술 id · MARKS 는 함수. 내용이 있는 묶음은 초월·비전 전부 + 8 스탯 직업 + 기계 수정 항목(§6)이 있어야 한다
//     (아직 빈 묶음 = 2차 물결 전 스텁 → '대기'로 알리고 넘어간다)
//  2) 정적 검사 §3.6: import 는 ./class_perks.js · ../data/* 만 · 최상단에서 bus./game./K./document./window. 없음 · createElement·
//     create*Gradient 없음 · drawMeter·MARKS 안에 Math.random/rand( 없음 · hitstop ≤ 0.08 · K.boom/K.shoot/K.bullet/K.spikeFx 에 proc 표시(경고)
//  3) 등록부 의미: 계보 순서(char → 0차 → 1차 → 2차 → 초월) · only · 남의/엉뚱한 asc 무시 · 메모·고정 · ascChanged 로 메모 비움 · this 묶기
//  4) 접기: perkMul · perkAny · perkHurt · perkAttack · perkPound · firePerks(오류 격리) · procAtk · mark/icd/slowEnemy/결계
//  5) 훅 자리: §3.4 · §9.2 · §6(HOOKS 몫) 줄이 파일에 있고 목록 확인으로 막혀 있다 (앵커 grep) + Player/World 메서드 단위 실행
//  6) PerkLayer: 특성 없는 영웅은 레이어를 붙이지 않음 · 표식 24개 상한 · 만료·죽은 적 정리 · 그리기 예산 < 0.05 ms (표식 24개)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maskJs, functionRanges, matchBrace, lineIndex } from './qa/lib/jsscan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');
const NO_TDZ = process.argv.includes('--no-tdz');
const url = (p) => pathToFileURL(path.join(ROOT, p)).href;
const imp = (p) => import(url(p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let fails = 0, passes = 0, warns = 0;
const ok = (cond, msg, extra) => { if (cond) { passes++; if (!QUIET && process.env.VERBOSE) console.log('  ✓ ' + msg); } else { fails++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } };
const warn = (msg) => { warns++; if (!QUIET) console.log('  ! ' + msg); };
const note = (msg) => { if (!QUIET) console.log('  · ' + msg); };
const section = (t) => console.log('▶ ' + t);

const GROUPS = {
  a: { heroes: ['kael', 'sera'], file: 'src/game/class_perks_a.js' },
  b: { heroes: ['victor', 'bran'], file: 'src/game/class_perks_b.js' },
  c: { heroes: ['lia', 'azel'], file: 'src/game/class_perks_c.js' },
  d: { heroes: ['isolde'], file: 'src/game/class_perks_d.js' },
};
// §6: 등록부 항목이 있어야 하는 줄 (C2·C5 는 문구만, C6·C10·C-x1 은 HOOKS 코드 수정)
const REQUIRED_FIX = {
  a: ['char:kael', 'kael_templar', 'sera_priestess', 'kael_stalker', 'sera_elementalist'],
  b: ['char:bran', 'victor_deadeye', 'bran_paladin', 'bran_guardian', 'bran_bloodrage'],
  c: ['lia_ninja', 'char:azel', 'azel_vampire', 'azel_bloodking'],
  d: [],
};

// ══════════════ 0. TDZ (새 프로세스마다 하나씩 먼저) ══════════════
section('TDZ: 모듈마다 새 node 프로세스에서 먼저 혼자 불러오기 (§3.5)');
const TDZ_ENTRIES = ['src/game/class_perks_a.js', 'src/game/class_perks_b.js', 'src/game/class_perks_c.js', 'src/game/class_perks_d.js',
  'src/game/class_perks.js', 'src/game/combat.js', 'src/game/skills.js', 'src/game/player.js', 'src/game/world.js'];
if (NO_TDZ) note('--no-tdz: 생략');
else for (const entry of TDZ_ENTRIES) {
  const code = `
    const first = await import(${JSON.stringify(url(entry))});
    const P = await import(${JSON.stringify(url('src/game/class_perks.js'))});
    await import(${JSON.stringify(url('src/game/skills.js'))});
    const reg = P.perkRegistry();
    const r = P.perksOf({ charId: 'kael', classId: 'kael_templar', asc: null });
    const out = { first: Object.keys(first).length, K: typeof P.K.SkillFx === 'function' && typeof P.K.glow === 'function' && typeof P.K.featherRenderL === 'function',
      reg: typeof reg === 'object', ids: r.ids.join(','), act: P.ascActive('nope') === null };
    process.stdout.write(JSON.stringify(out));`;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  let j = null;
  try { j = JSON.parse(res.stdout.trim().split('\n').pop()); } catch { /* 아래에서 실패로 */ }
  ok(res.status === 0 && j, `${entry} 를 먼저 불러도 오류 없음`, res.status === 0 ? res.stdout.slice(-200) : (res.stderr || '').split('\n').slice(0, 4).join(' | '));
  if (j) {
    ok(j.K, `${entry} 먼저: skills.js 뒤 K 가 채워짐 (SkillFx·glow·featherRenderL)`);
    ok(j.ids === 'char:kael,kael_hunter,kael_crusader,kael_templar' && j.reg && j.act, `${entry} 먼저: perksOf·perkRegistry·ascActive 동작`, j);
  }
}

// ══════════════ 이 프로세스: 모듈 ══════════════
const PERK = await imp('src/game/class_perks.js');
const CONTENT = { a: await imp(GROUPS.a.file), b: await imp(GROUPS.b.file), c: await imp(GROUPS.c.file), d: await imp(GROUPS.d.file) };
await imp('src/game/skills.js');   // K 채우기
const { CLASSES } = await imp('src/data/classes.js');
const { ASCENSIONS, ASC_IDS } = await imp('src/data/ascensions.js');
const { ASC_SKILLS } = await imp('src/data/skills_asc.js');
const { CHARACTERS } = await imp('src/data/characters.js');
const { bus } = await imp('src/core/events.js');
const { computeDamage } = await imp('src/game/combat.js');
const { Player } = await imp('src/game/player.js');
const { World } = await imp('src/game/world.js');
const { HOOK_NAMES, ENTRY_KEYS } = PERK;
const charOf = (key) => (key.startsWith('char:') ? key.slice(5) : CLASSES[key]?.charId ?? ASCENSIONS[key]?.charId ?? null);

// ══════════════ 1. 표 ══════════════
section('표: 키·훅 이름·묶음·겹침 (§3.1 · §3.2)');
const seenKeys = new Map();
for (const [g, G] of Object.entries(GROUPS)) {
  const U = g.toUpperCase(), M = CONTENT[g];
  const PERKS = M['PERKS_' + U], ACTIVES = M['ACTIVES_' + U], MARKS = M['MARKS_' + U];
  ok(PERKS && typeof PERKS === 'object' && ACTIVES && typeof ACTIVES === 'object' && MARKS && typeof MARKS === 'object', `${G.file}: PERKS_${U}·ACTIVES_${U}·MARKS_${U} 내보냄`);
  if (!PERKS || !ACTIVES || !MARKS) continue;
  for (const [key, E] of Object.entries(PERKS)) {
    const cid = charOf(key);
    ok(cid && (key.startsWith('char:') ? !!CHARACTERS[cid] : true), `${key}: CLASSES·ASCENSIONS·char:<영웅> 중 하나`);
    ok(G.heroes.includes(cid), `${key}: ${G.file} 묶음의 영웅 (${G.heroes.join('·')})`, cid);
    ok(!seenKeys.has(key), `${key}: 다른 묶음과 겹치지 않음`, seenKeys.get(key));
    seenKeys.set(key, g);
    ok(E && typeof E === 'object' && !Array.isArray(E), `${key}: 항목은 객체`);
    if (!E || typeof E !== 'object') continue;
    for (const [k, v] of Object.entries(E)) {
      if (typeof v === 'function') ok(HOOK_NAMES.includes(k), `${key}.${k}: 훅 이름 ⊂ HOOK_NAMES`);
      else ok(ENTRY_KEYS.includes(k) && !HOOK_NAMES.includes(k), `${key}.${k}: 함수가 아닌 키는 only·N 뿐`);
    }
    if ('only' in E) ok(typeof E.only === 'boolean', `${key}.only 는 참/거짓`);
    if ('N' in E) ok(E.N && typeof E.N === 'object', `${key}.N 은 객체 (모든 조절 수치)`);
  }
  const mySkills = ASC_SKILLS.filter((s) => G.heroes.includes(s.charId)).map((s) => s.id);
  for (const [id, fn] of Object.entries(ACTIVES)) {
    ok(mySkills.includes(id), `ACTIVES_${U}.${id}: 이 묶음의 비전 기술 id`, mySkills);
    ok(typeof fn === 'function', `ACTIVES_${U}.${id}: 함수 (p, w, lv)`);
  }
  for (const [k, fn] of Object.entries(MARKS)) ok(typeof fn === 'function', `MARKS_${U}.${k}: 함수 (ctx, e, n, k, t)`);
  // 범위: 내용이 있는 묶음만 (빈 묶음 = 2차 물결 전 스텁)
  const filled = Object.keys(PERKS).length > 0;
  if (!filled) note(`${G.file}: 아직 빈 표 (HOOKS 스텁) — 범위 검사는 2차 물결 뒤에 (대기)`);
  else {
    const need = [...G.heroes.flatMap((h) => ASC_IDS[h] ?? []), ...REQUIRED_FIX[g]];
    for (const id of need) ok(Object.prototype.hasOwnProperty.call(PERKS, id), `${G.file}: ${id} 항목이 있다 (§4·§5·§6)`);
  }
  if (Object.keys(ACTIVES).length) for (const id of mySkills) ok(typeof ACTIVES[id] === 'function', `ACTIVES_${U}: ${id} 이 있다 (§5)`);
  else if (filled) warn(`ACTIVES_${U}: 비전 액티브가 아직 없다 (${mySkills.join(', ')})`);
}
ok(PERK.ascActive('asc_kael_firstseal') === (CONTENT.a.ACTIVES_A.asc_kael_firstseal ?? null), 'ascActive: ACTIVES 를 합쳐 찾는다 (없으면 null)');

// ══════════════ 2. 정적 검사 ══════════════
section('정적 검사 (§3.5 · §3.6)');
const TOP_BAD = /\b(bus|game|K|document|window)\s*\.\s*[A-Za-z_$]/g;
function staticScan(file, { content }) {
  const src = read(file), m = maskJs(src), L = lineIndex(src), fns = functionRanges(m);
  const inFn = (off) => fns.some((f) => f.start <= off && off <= f.end);
  // import
  if (content) {
    for (const r of src.matchAll(/^\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/gm)) {
      const spec = r[1];
      ok(spec === './class_perks.js' || /^\.\.\/data\/[\w.]+\.js$/.test(spec), `${file}: import '${spec}' (./class_perks.js · ../data/* 만)`);
    }
  }
  // 최상단 접근
  let r; TOP_BAD.lastIndex = 0;
  while ((r = TOP_BAD.exec(m))) {
    if (inFn(r.index)) continue;
    const before = m.slice(Math.max(0, r.index - 1), r.index);
    if (/[\w$.]/.test(before)) continue;   // obj.K.x 등 다른 식의 일부
    ok(false, `${file}:${L.line(r.index)} 최상단에서 ${r[1]}. 을 읽는다 (훅 본문 안에서만)`, L.text(L.line(r.index)).trim());
  }
  ok(!/document\s*\.\s*createElement|new\s+OffscreenCanvas/.test(m), `${file}: 캔버스를 만들지 않는다 (createElement·OffscreenCanvas 없음)`);
  ok(!/\bcreate(?:Linear|Radial|Conic)Gradient\s*\(/.test(m), `${file}: create*Gradient 없음 (K.glow·K.beamH·K.beamV 캐시 스프라이트)`);
  // 그리기 경로: drawMeter · MARKS_X 표 · drawPerkLayer
  const drawRanges = fns.filter((f) => f.name === 'drawMeter' || f.name === 'drawPerkLayer').map((f) => [f.start, f.end]);
  for (const mm of m.matchAll(/\bMARKS_[A-D]\s*=\s*\{/g)) { const open = mm.index + mm[0].length - 1; drawRanges.push([open, matchBrace(m, open)]); }
  for (const [a, b] of drawRanges) {
    const seg = m.slice(a, b + 1);
    ok(!/Math\s*\.\s*random|\brand\s*\(|\brandi\s*\(|\bchance\s*\(/.test(seg), `${file}:${L.line(a)} 그리기 경로에 난수 없음`);
    ok(!/\.fx\s*\.\s*(?:emit|burst|ring|flash|slash|text|sprite|dmg|callout|ghost)\s*\(/.test(seg), `${file}:${L.line(a)} 그리기 경로에서 파티클을 만들지 않음`);
  }
  // 경직: 해방기만 ≤ 0.08
  for (const h of m.matchAll(/\bhitstop\s*:\s*([\d.]+)/g)) ok(Number(h[1]) <= 0.08, `${file}:${L.line(h.index)} hitstop ${h[1]} ≤ 0.08`);
  // proc 표시 (어림: K.boom/K.shoot/K.bullet/K.spikeFx 인자에 proc 가 없으면 경고 — 네필림 깃털·비전 액티브는 예외)
  if (content) for (const c of m.matchAll(/\bK\s*\.\s*(boom|shoot|bullet|spikeFx)\s*\(/g)) {
    const open = c.index + c[0].length - 1;
    let d = 0, end = open;
    for (let i = open; i < m.length; i++) { if (m[i] === '(') d++; else if (m[i] === ')') { d--; if (d === 0) { end = i; break; } } }
    const arg = m.slice(open, end + 1);
    if (!/\bproc\b/.test(arg) && !/feather/.test(src.slice(open, end + 1))) warn(`${file}:${L.line(c.index)} K.${c[1]}(…) 에 proc 표시가 보이지 않는다 (특성이 만드는 공격은 proc — §3.6.1)`);
  }
}
for (const G of Object.values(GROUPS)) staticScan(G.file, { content: true });
staticScan('src/game/class_perks.js', { content: false });

// ══════════════ 3. 등록부 의미 ══════════════
section('등록부: 계보·only·메모 (§3.3)');
const calls = [];
const rec = (tag) => function (...a) { calls.push(tag); return this?.N?.k; };
const FAKE = {
  'char:kael': { tick: rec('char'), N: { k: 1.1 } },
  kael_hunter: { only: true, tick: rec('hunter-only') },
  kael_crusader: { tick: rec('crusader'), dmgMul: function () { return this.N.k; }, N: { k: 1.2 } },
  kael_templar: { only: true, tick: rec('templar') },
  kael_inquisitor: { tick: rec('inquisitor') },
  kael_grandtemplar: { only: true, tick: rec('grandtemplar'), drawMeter: () => {} },
  sera_bellsaint: { tick: rec('bell') },
  kael_stalker: { notAHook: 3 },
};
PERK.setPerkRegistry(FAKE);
const H = (classId, asc = null, charId = 'kael') => ({ charId, classId, asc });
const pT = PERK.perksOf(H('kael_templar'));
ok(pT.ids.join() === 'char:kael,kael_hunter,kael_crusader,kael_templar', 'ids = char → 0차 → 1차 → 2차', pT.ids);
ok(pT.active.join() === 'char:kael,kael_crusader,kael_templar', 'only 항목은 자기 id 일 때만 (kael_hunter only 는 빠짐)', pT.active);
calls.length = 0; PERK.firePerks(pT.tick, {}, {}, 0);
ok(calls.join() === 'char,crusader,templar', 'tick 순서: 계보 순서', calls);
ok(PERK.perkMul(pT.dmgMul) === 1.2, '훅은 항목에 묶인다 (this.N)', PERK.perkMul(pT.dmgMul));
ok(!('onHit' in pT) && Array.isArray(pT.tick) && Object.isFrozen(pT) && Object.isFrozen(pT.tick), '있는 훅만 배열 · 객체와 배열은 고정');
ok(PERK.perksOf(H('kael_templar')) === pT, '같은 heroKey → 같은 메모 객체');
const pG = PERK.perksOf(H('kael_templar', 'kael_grandtemplar'));
ok(pG !== pT && pG.ids.at(-1) === 'kael_grandtemplar' && pG.active.includes('kael_grandtemplar') && !!pG.drawMeter, '초월이 마지막 id · only 초월 항목 적용');
const pH = PERK.perksOf(H('kael_hunter'));
ok(pH.active.join() === 'char:kael,kael_hunter', '0차 only 항목은 0차일 때 적용', pH.active);
ok(PERK.perksOf(H('kael_templar', 'sera_bellsaint')).active.join() === pT.active.join(), '남의 영웅 asc 는 무시');
ok(PERK.perksOf(H('kael_templar', 'kael_highinquisitor')).ids.at(-1) === 'kael_templar', '부모가 다른 초월 asc 는 무시');
ok(PERK.perksOf(H('kael_templar', 'zz_none')).ids.length === 4, '모르는 asc 는 무시');
const pNone = PERK.perksOf(H('victor_hellfire', null, 'victor'));
ok(pNone.any === false && pNone.tick === undefined && pNone.ids[0] === 'char:victor', '항목 없는 영웅: any=false, 훅 배열 없음');
ok(PERK.perksOf(null).any === false && PERK.perksOf(undefined).ids.length === 0, 'perksOf(null) → 빈 목록');
bus.emit('ascChanged', { charId: 'kael', classId: 'kael_templar', asc: null, prev: null, first: false });
ok(PERK.perksOf(H('kael_templar')) !== pT, 'ascChanged 뒤 메모를 다시 만든다');
bus.emit('classChanged', { charId: 'kael', classId: 'kael_templar', asc: null });
const pT2 = PERK.perksOf(H('kael_templar'));
ok(pT2.key === 'kael_templar|', 'key = heroKey', pT2.key);

// ══════════════ 4. 접기·도우미 ══════════════
section('접기·도우미 (§3.3)');
ok(PERK.perkMul(undefined) === 1 && PERK.perkMul(null, 1) === 1, 'perkMul(없음) = 1');
ok(Math.abs(PERK.perkMul([() => 2, () => 0.5, () => -1, () => NaN, () => Infinity, () => 'x', () => undefined, () => 1.5]) - 1.5) < 1e-12, 'perkMul: 유한한 양수만 곱한다');
let anyCalls = 0;
ok(PERK.perkAny([() => 0, () => { anyCalls++; return true; }, () => { anyCalls++; return true; }]) === true && anyCalls === 1, 'perkAny: 처음 true 에서 멈춘다');
ok(PERK.perkAny([() => 1, () => 'yes', () => null]) === false && PERK.perkAny(undefined) === false, 'perkAny: === true 만');
ok(PERK.perkHurt(null, {}, 10) === null && PERK.perkHurt([() => undefined, () => ({})], {}, 10) === null, 'perkHurt: 바뀐 것 없으면 null');
const seen = [];
let hr = PERK.perkHurt([(p, d) => { seen.push(d); return d * 0.5; }, (p, d) => { seen.push(d); return { armor: true }; }, (p, d) => { seen.push(d); return { dmg: d - 1 }; }], {}, 10);
ok(hr && hr.dmg === 4 && hr.armor === true && seen.join() === '10,5,5', 'perkHurt: 숫자 → 바꿈, {dmg} 합침, armor OR, 다음 항목은 바뀐 피해', { hr, seen });
let after = false;
ok(PERK.perkHurt([() => 3, () => false, () => { after = true; return 1; }], {}, 10) === false && !after, 'perkHurt: false 는 곧바로 무효 (뒤 항목 안 부름)');
ok(PERK.perkHurt([() => -5, () => NaN, () => ({ dmg: -1 })], {}, 10) === null, 'perkHurt: 음수·NaN 무시');
const atk0 = { mult: 2, crit: 5, flat: 0, element: 'fire', tags: ['melee'] };
ok(PERK.perkAttack([() => undefined, () => ({}), () => ({ mult: 1 })], {}, atk0, {}, {}) === atk0, 'perkAttack: 바뀐 것 없으면 같은 객체');
const atk1 = PERK.perkAttack([() => ({ mult: 1.5, crit: 10 }), () => ({ mult: 2, flat: 30, element: 'holy' }), () => ({ flat: 20, crit: 5, element: 'dark', executed: true })], {}, atk0, {}, {});
ok(atk1 !== atk0 && atk1.mult === 6 && atk1.crit === 20 && atk1.flat === 30 && atk1.element === 'dark' && atk1.executed === true && atk0.mult === 2 && atk0.element === 'fire', 'perkAttack: mult 곱 · crit 합 · flat 최댓값 · element 마지막 · executed', atk1);
const pk0 = { r: 154, element: 'thunder', color: '#fff' };
const rs = [];
const pk1 = PERK.perkPound([(p, w, r, fall) => { rs.push(r, fall); return { r: r + 20 }; }, (p, w, r) => { rs.push(r); return { color: '#000', element: null }; }], {}, {}, 154, 300, pk0);
ok(pk1 !== pk0 && pk1.r === 174 && pk1.color === '#000' && pk1.element === 'thunder' && rs.join() === '154,300,174' && pk0.r === 154, 'perkPound: { ...pk, ...결과 } (null 값은 덮지 않음, 다음 항목은 바뀐 반경)', { pk1, rs });
ok(PERK.perkPound(null, {}, {}, 1, 0, pk0) === pk0 && PERK.perkPound([() => null], {}, {}, 1, 0, null) === null, 'perkPound: 바뀐 것 없으면 pk 그대로');
ok(PERK.perkPound([() => ({ r: 99 })], {}, {}, 110, 0, null)?.r === 99, 'perkPound: 옛 결과(pk) 없이도');
// firePerks 오류 격리
const e0 = PERK.PERK_STATS.errors, c0 = PERK.PERK_STATS.calls;
let thrown = 0, later = 0;
const boom = () => { thrown++; throw new Error('perk test throw (예상된 오류)'); };
const L2 = [boom, () => { later++; }];
const cerr = console.error; console.error = () => {};
PERK.firePerks(L2); PERK.firePerks(L2);
ok(PERK.perkMul([boom, () => 2]) === 2, 'perkMul: 던진 훅은 건너뛴다');
console.error = cerr;
ok(thrown === 1 && later === 2 && PERK.PERK_STATS.errors === e0 + 1, '오류 격리: 던진 훅은 한 번만 기록되고 그 뒤 건너뜀, 다른 훅은 계속', { thrown, later, errors: PERK.PERK_STATS.errors - e0 });
ok(PERK.PERK_STATS.calls > c0 && Number.isFinite(PERK.PERK_STATS.ms), 'PERK_STATS: calls·ms');
// procAtk
const pp = { stats: { atk: 10 }, facing: -1 };
const a1 = PERK.procAtk(pp, { mv: 0.3, element: 'fire', hitstop: 0.5 }), a2 = PERK.procAtk(pp);
ok(a1.proc === true && a1.owner === pp && a1.team === 'player' && a1.mult === 1 && a1.breakWalls === false && a1.hitstop === 0.08 && a1.dir === -1 && a1.element === 'fire', 'procAtk: proc · mult 1 · 벽 안 부숨 · hitstop ≤ 0.08', a1);
ok(a2.hitId !== a1.hitId && a2.hitstop === 0 && a2.tags.join() === 'melee' && a2.type === 'phys' && a2.mv === 1, 'procAtk: 기본값 · hitId 마다 새로');
// 표식
const W0 = { time: 10 };
const en = { world: W0, update(dt) { this.u = (this.u ?? 0) + dt; } };
ok(PERK.mark(en, 'brand', 4, 1, 3) === 1 && PERK.mark(en, 'brand', 4, 1, 3) === 2 && PERK.mark(en, 'brand', 4, 5, 3) === 3, 'mark: 중첩 (최대 max)');
ok(PERK.markOf(en, 'brand') === 3 && PERK.markOf(en, 'nope') === 0, 'markOf');
W0.time = 14.5;
ok(PERK.markOf(en, 'brand') === 0 && PERK.mark(en, 'brand', 4) === 1, '만료되면 0 · 다시 붙이면 1부터');
ok(PERK.unmark(en, 'brand', 1) === 0 && PERK.markOf(en, 'brand') === 0, 'unmark');
PERK.mark(en, 'seal', 5, 5, 5);
ok(PERK.unmark(en, 'seal', 2) === 3 && PERK.unmark(en, 'seal') === 0, 'unmark(n) · unmark 전부');
ok(PERK.mark({ dead: true, world: W0 }, 'x', 1) === 0 && PERK.mark(null, 'x', 1) === 0, 'mark: 죽은 적·null → 0');
// icd
const ob = { world: { time: 0 } };
ok(PERK.icd(ob, 'k', 1.5) === true && PERK.icd(ob, 'k', 1.5) === false, 'icd: 처음 준비 → 대기 시작');
ob.world.time = 1.49; ok(PERK.icd(ob, 'k', 1.5) === false, 'icd: 대기 중');
ob.world.time = 1.5; ok(PERK.icd(ob, 'k', 1.5) === true, 'icd: 시간이 되면 다시 준비');
ok(PERK.icd(ob, 'other', 1, { time: 0 }) === true && PERK.icd(ob, 'other', 1, { time: 0.5 }) === false, 'icd: 키마다 따로 · w 인자');
// slowEnemy
const sw = { time: 0 };
const foe = { world: sw, update(dt) { this.u = (this.u ?? 0) + dt; } };
ok(PERK.slowEnemy(foe, 0.5, 1, sw) === true, 'slowEnemy: 감싼다');
foe.update(0.1, sw); ok(Math.abs(foe.u - 0.05) < 1e-9, 'slowEnemy: dt × mul', foe.u);
ok(PERK.slowEnemy(foe, 0.25, 2, sw) === true && foe.__pkSlow.k === 0.25 && foe.__pkSlow.until === 2, 'slowEnemy: 다시 걸면 갱신만 (더 느린 배율·긴 시간)');
sw.time = 2.1; foe.update(0.1, sw);
ok(Math.abs(foe.u - 0.15) < 1e-9 && !Object.prototype.hasOwnProperty.call(foe, '__pkSlow') && !Object.prototype.hasOwnProperty.call(foe, 'update') === false, '만료: 원래 update 로 되돌림', foe.u);
foe.update(0.1, sw); ok(Math.abs(foe.u - 0.25) < 1e-9, '되돌린 뒤 dt 그대로', foe.u);
class Foe { update(dt) { this.u = (this.u ?? 0) + dt; } }
const pf = new Foe(); pf.world = sw;
PERK.slowEnemy(pf, 0.5, 1, sw); sw.time = 5; pf.update(0.2, sw);
ok(!Object.prototype.hasOwnProperty.call(pf, 'update') && pf.update === Foe.prototype.update, '프로토타입 update 인 적은 감싸기를 지워 되돌림');
ok(PERK.slowEnemy({ __awSlow: {}, update() {} }, 0.5, 1, sw) === false, '각성 감속 중인 적은 건드리지 않음');
// 결계
const sp = { world: { time: 3 } };
ok(PERK.shieldAdd(sp, 50, 30) === 30 && PERK.shieldOf(sp) === 30 && sp._shieldAt === 3, 'shieldAdd: 상한');
ok(PERK.shieldAbsorb(sp, 10) === 0 && PERK.shieldOf(sp) === 20 && PERK.shieldAbsorb(sp, 50) === 30 && PERK.shieldOf(sp) === 0, 'shieldAbsorb: 결계가 먼저 받고 남은 피해');
ok(PERK.shieldAbsorb({}, 7) === 7 && PERK.shieldOf(null) === 0, '결계 없음 → 그대로');
const ps = {}; ok(PERK.perkState(ps) === PERK.perkState(ps) && ps._pk, 'perkState: 영웅마다 하나');

// ══════════════ 5. 훅 자리 ══════════════
section('훅 자리 (§3.4 · §6 · §9.2 앵커)');
const SITES = {
  'src/game/player.js': [
    ['refreshStats perksOf', /this\.look = composeLook\(this\.state, this\.hero\);\n\s*this\.perks = perksOf\(this\.hero\);/],
    ['speedMul', 'get speedMul() { return (1 + (this.stats.moveSpd ?? 0) / 100) * (this.buffs.haste ? 1.4 : 1) * (this.perks?.speedMul ? perkMul(this.perks.speedMul, this) : 1); }'],
    ['atkSpdMul', '(this.perks?.atkSpdMul ? perkMul(this.perks.atkSpdMul, this) : 1)'],
    ['dmgMul', /if \(this\.perks\?\.dmgMul\) m \*= perkMul\(this\.perks\.dmgMul, this, this\.world\);\n\s*return m;/],
    ['tick', 'if (this.perks?.tick) firePerks(this.perks.tick, this, world, dt);'],
    ['onDashEnd', "this.lastDashEnd = this.t; dashFx?.(this, world, 'end'); if (this.perks?.onDashEnd) firePerks(this.perks.onDashEnd, this, world);"],
    ['onLand', 'if (!this.mount?.riding && this.perks?.onLand) firePerks(this.perks.onLand, this, world, Math.max(0, this.y - (this.apexY ?? this.y)));'],
    ['dashMul', 'if (this.perks?.dashMul) this.dashSpeed *= perkMul(this.perks.dashMul, this);'],
    ['onDash', 'if (this.perks?.onDash) firePerks(this.perks.onDash, this, world);'],
    ['onJump wall', "if (this.perks?.onJump) firePerks(this.perks.onJump, this, world, 'wall');"],
    ['onJump air', 'if (this.perks?.onJump) firePerks(this.perks.onJump, this, world, air);'],
    ['onPound', 'const pk2 = this.perks?.onPound ? perkPound(this.perks.onPound, this, world, pk?.r > 0 ? pk.r : r, fall, pk) : pk;'],
    ['onPound uses pk2', /if \(pk2\?\.r > 0\) r = pk2\.r;[\s\S]{0,400}pk2\?\.color[\s\S]{0,900}pk2\?\.element/],
    ['onSwing', /SKILL_IMPL\.__onSwing\?\.\(this, world, mv\);\n\s*if \(this\.perks\?\.onSwing\) firePerks\(this\.perks\.onSwing, this, world, mv\);/],
    ['rules label (sub)', "`${world.rules?.label ?? '오늘의 도전 규칙'}: 보조 무기를 쓸 수 없다`"],
    ['reqAsc guard', /if \(!sk \|\| !lv\) return;\n\s*if \(sk\.reqAsc && this\.hero\.asc !== sk\.reqAsc\) \{ this\.game\.toast\('비전 직업일 때만 쓸 수 있다', '#c8a0ff', 1\.4\); return; \}/],
    ['onSkill', /if \(castSkill\(this, world, skillId, lv\)\) \{[^}]*if \(this\.perks\?\.onSkill\) firePerks\(this\.perks\.onSkill, this, world, skillId\);/],
    ['onHurt', /if \(this\.invuln\) return false;\n\s*let armorPk = false; const ph = this\.perks\?\.onHurt \? perkHurt\(this\.perks\.onHurt, this, dmg, attack, world\) : null; if \(ph === false\) return false; if \(ph\) \{ dmg = ph\.dmg; armorPk = !!ph\.armor; \}/],
    ['armorPk', /const armored = this\.superArmor > 0 \|\| !!\(mr\?\.mounted && mr\.noStagger\) \|\| armorPk;/],
    ['onDodge', /this\.ghostTrail\(world, '#ff7a9a'\);\n\s*if \(this\.perks\?\.onDodge\) firePerks\(this\.perks\.onDodge, this, world, attack\);\n\s*return false;/],
    ['afterHurt', "bus.emit('playerHurt', { amount: dmg, attack }); if (this.perks?.afterHurt) firePerks(this.perks.afterHurt, this, dmg, attack, world);"],
    ['onLethal before saint', /if \(this\.hp <= 0\) \{\n\s*if \(this\.perks\?\.onLethal && perkAny\(this\.perks\.onLethal, this, attack, world\)\) return true;\n\s*\/\/ 성녀/],
    ['healMul', 'if (amount > 0 && this.perks?.healMul) amount *= perkMul(this.perks.healMul, this);'],
    ['onOverheal', 'if (this.perks?.onOverheal && amount - (this.hp - before) > 0.5) firePerks(this.perks.onOverheal, this, amount - (this.hp - before), this.world);'],
    ['backingLayer honoured', 'if (!world.backingLayer) this.drawBacking(ctx, world);'],
  ],
  'src/game/combat.js': [
    ['import perkAttack', "import { perkAttack } from './class_perks.js';"],
    ['onAttack', 'if (!attack.proc && attack.owner.perks?.onAttack) attack = perkAttack(attack.owner.perks.onAttack, attack.owner, attack, target, world);'],
    ['C10 holy resist 100', 'clamp(r, -100, r >= 100 ? 100 : 80)'],
  ],
  'src/game/world.js': [
    ['import', "import { firePerks, perkAny } from './class_perks.js';"],
    ['onHit', /this\.style\?\.onHit\?\.\(info, attack, target\);[^\n]*\n\s*if \(!guardian && attack\?\.owner === p && !attack\.proc && p\.perks\?\.onHit\) firePerks\(p\.perks\.onHit, p, target, info, attack, this\);/],
    ['onKill', /if \(this\.hero\.classId === 'lia_reaper'\)[^\n]*\n\s*if \(p\.perks\?\.onKill && attack\?\.owner === p\) firePerks\(p\.perks\.onKill, p, e, attack, this\);/],
    ['keepCombo', 'if (this.combo.n > 0 && !(this.player?.perks?.keepCombo && perkAny(this.player.perks.keepCombo, this.player, dmg))) this.endCombo();'],
    ['ctor options', "constructor(game, stageId, { roomId = null, mode = 'story', onExit = null, rules = null, diffOver = null, levelOverride = null, trial = null } = {})"],
    ['diffOver after ar.diffOver', /ar\.diffOver \};[^\n]*\n\s*if \(diffOver\) this\.diff = \{ \.\.\.this\.diff, \.\.\.diffOver \};/],
    ['levelOverride before NG', /if \(levelOverride\) this\.stage = \{ \.\.\.this\.stage, level: levelOverride \};[^\n]*\n\s*this\.ng = /],
    ['rules', 'this.rules = rules ?? (ar?.rules && typeof ar.rules === \'object\' ? ar.rules : null);'],
    ['trial + ngBoss', 'this.trial = trial; if (trial?.bossPatterns) this.ngBoss = true;'],
    ['marker skip', /for \(const m of ms\) \{\n\s*if \(this\.trial && \(m\.ch === '\$' \|\| m\.ch === '@' \|\| m\.ch === '!' \|\| m\.ch === 'S'\)\) continue;/],
    ['TRIAL_PICKUPS', "const TRIAL_PICKUPS = new Set(['heart', 'food', 'sub', 'powerup']);"],
    ['spawnPickup guard', 'if (this.trial && !TRIAL_PICKUPS.has(type)) return null;'],
    ['spawnPlaced null-safe', 'if (p) p.secretKey = key;'],
    ['exp/companion gate', /if \(!this\.trial\) \{[^}]*this\.gainExp\(expGain\);[^}]*this\.companions\?\.onKill\(e, expGain\);/],
    ['loot gate', 'if (!this.trial) for (const d of rollEnemyLoot(this, e)) this.spawnPickup(d.type, e.cx, e.cy, d.data);'],
    ['stash gate', 'if (this.arcade || this.trial || !this.entities?.length) return 0;'],
    ['deliver gate', /deliverStash\(\) \{\n\s*if \(this\.arcade \|\| this\.trial\) return 0;/],
    ['backingLayer flag', 'this.backingLayer = true;'],
    ['drawBacking before z>=0 loop', /const P = this\.player; if \(P && list\.includes\(P\)\) P\.drawBacking\?\.\(ctx, this\);[^\n]*\n\s*for \(const e of list\) if \(e\.z >= 0\) e\.draw\(ctx, this\);/],
  ],
  'src/game/skills.js': [
    ['import PERK', "import * as PERK from './class_perks.js';"],
    ['castSkill fallback', 'const fn = SKILL_IMPL[id] ?? PERK.ascActive(id);'],
    ['inquisitor inq tag', "atk: { tags: ['melee', 'inq'], hitId: p.curHitId + 'f' }"],
    ['hellfire _heatK', 'const kr = p._heatK?.r ?? 1, km = p._heatK?.mv ?? 1;'],
    ['hellfire miss fizz', /else hellfireFizz\(ww, p, pr, kr, km\);/],
    ['hellfire fizz proc 0.25 r24', /PERK\.procStrike\(w, p, circ\(pr\.cx, pr\.cy, 24 \* kr\), \{ mv: 0\.25 \* km, element: 'fire'/],
    ['bladedancer C-x1', /case 'lia_bladedancer': \{\n\s*if \(\(w\.combo\?\.n \?\? 0\) === 0\) p\._bdN = 0;[^\n]*\n\s*p\._bdN = \(p\._bdN \?\? 0\) \+ 1;/],
    ['FXKIT additions', 'Object.assign(FXKIT, { featherRenderL, featherRenderD, batRender, shurikenRender, daggerRender, tipOf, ISO_BOLT });'],
    ['bindPerkKit', /PERK\.bindPerkKit\(FXKIT\);\s*$/],
  ],
  'src/game/inventory.js': [
    ['rules label (potion)', "`${w.rules?.label ?? '오늘의 도전 규칙'}: 물약을 쓸 수 없다.`"],
  ],
};
for (const [file, list] of Object.entries(SITES)) {
  const src = read(file);
  for (const [name, pat] of list) ok(typeof pat === 'string' ? src.includes(pat) : pat.test(src), `${file}: ${name}`);
}
{
  const sk = read('src/game/skills.js');
  const hb = sk.slice(sk.indexOf('function hookBus()'), sk.indexOf('function freshShots('));
  ok(hb.length > 0 && !/bus\.on\(\s*'playerHurt'/.test(hb), "skills.js hookBus: 성전 기사 playerHurt 구독 삭제 (C3 → kael_templar.afterHurt)");
  ok(!/'오늘의 도전 규칙: /.test(read('src/game/player.js') + read('src/game/inventory.js')), '규칙 문구는 world.rules.label 을 앞에 쓴다 (고정 문구 없음)');
}

section('훅 단위 실행 (Player · World · combat 메서드)');
{
  // Player getter · heal · takeHit (가짜 this)
  const desc = (k) => Object.getOwnPropertyDescriptor(Player.prototype, k).get;
  const base = { stats: { moveSpd: 0, atkSpd: 0, hp: 100 }, buffs: {}, hero: { classId: 'x' }, hp: 100, world: {} };
  ok(desc('speedMul').call({ ...base, perks: { speedMul: [() => 1.25] } }) === 1.25 && desc('speedMul').call({ ...base, perks: {} }) === 1, 'speedMul 훅');
  ok(desc('atkSpeedMul').call({ ...base, perks: { atkSpdMul: [() => 1.25] } }) === 1.25, 'atkSpdMul 훅');
  ok(Math.abs(desc('dmgMul').call({ ...base, perks: { dmgMul: [() => 1.1] } }) - 1.1) < 1e-12 && desc('dmgMul').call({ ...base, perks: null }) === 1, 'dmgMul 훅');
  const over = [];
  const hp = Object.assign(Object.create(Player.prototype), { stats: { hp: 100 }, hp: 50, cx: 0, y: 0, world: { fx: { text() {} } }, perks: { healMul: [() => 2], onOverheal: [(p, o) => over.push(o)] } });
  ok(hp.heal(30, false) === 50 && hp.hp === 100 && over[0] === 10, 'heal: healMul ×2 → 넘친 10 은 onOverheal', { hp: hp.hp, over });
  const hurtLog = [];
  const mkP = (perks, hpv = 100) => Object.assign(Object.create(Player.prototype), {
    stats: { hp: 100 }, hp: hpv, buffs: {}, iframes: 0, dashT: 0, dead: false, hero: { classId: 'kael_templar' }, superArmor: 0, perks,
    world: { cutscene: false, companions: null, fx: { text() {} }, run: {} }, game: { toast() {} }, x: 0, y: 0, w: 20, h: 40, facing: 1,
  });
  const fw = { companions: null, onPlayerHurt: (d) => hurtLog.push(['hurt', d]), fx: { text() {} }, game: { flash() {}, toast() {} } };
  const atkE = { team: 'enemy', dir: 1 };
  ok(mkP({ onHurt: [() => false] }).takeHit(10, atkE, fw, {}) === false && hurtLog.length === 0, 'takeHit: onHurt false → 무효 (playerHurt 없음)');
  const pa = mkP({ onHurt: [() => ({ dmg: 4, armor: true })], afterHurt: [(p, d, a) => hurtLog.push(['after', d, a === atkE])] });
  ok(pa.takeHit(10, atkE, fw, {}) === true && pa.hp === 96 && pa.iframes === 0.6 && !(pa.hurtT > 0), 'takeHit: {dmg, armor} → 피해 4 · 경직 없음', { hp: pa.hp, iframes: pa.iframes });
  ok(hurtLog.some((r) => r[0] === 'after' && r[1] === 4 && r[2]), 'afterHurt(p, dmg, atk, w)', hurtLog);
  const pl = mkP({ onHurt: [() => ({ armor: true })], onLethal: [(p) => { p.hp = 1; return true; }] }, 5);
  ok(pl.takeHit(50, atkE, fw, {}) === true && pl.hp === 1 && !pl.dead, 'onLethal true → 살아남음 (사망 처리 없음)');
  // World 메서드 (가짜 this)
  const hits = [];
  const P = { stats: { ultGain: 0, lifesteal: 0, hp: 100, expBonus: 0 }, dead: false, perks: { onHit: [(p, t, info, a) => hits.push(a.tag)], onKill: [(p, e, a) => hits.push('kill:' + a.tag)], keepCombo: [] } };
  const fakeW = () => ({ combo: { n: 0, t: 0, max: 0, dmg: 0 }, hero: { classId: 'x' }, run: { hits: 0, sp: 0, kills: 0 }, player: P, addScore() {}, style: null, awOnHit() {}, overkillSlowmo() {}, companions: null, state: { stats: {}, bestiary: {} } });
  const tgt = { kind: 'enemy' };
  for (const [a, want] of [[{ owner: P, tag: 'own', tags: ['melee'] }, true], [{ owner: P, tag: 'proc', proc: true, tags: ['melee'] }, false], [{ owner: P, tag: 'guard', tags: ['guardian'] }, false], [{ owner: {}, tag: 'other', tags: ['melee'] }, false]]) {
    hits.length = 0; World.prototype.onPlayerHit.call(fakeW(), tgt, { dmg: 5 }, a);
    ok(hits.includes(a.tag) === want, `onPlayerHit: ${a.tag} → onHit ${want ? '부름' : '안 부름'}`, hits);
  }
  const spy = { exp: 0, cmp: 0, loot: 0 };
  const wk = Object.assign(fakeW(), { trial: { id: 'tr_kael_1' }, gainExp() { spy.exp++; }, companions: { onKill() { spy.cmp++; } }, spawnPickup() { spy.loot++; }, killFeel() {} });
  hits.length = 0;
  World.prototype.onEnemyKilled.call(wk, { def: { id: 'bat', score: 10 }, stats: { exp: 50 }, cx: 0, cy: 0 }, { owner: P, tag: 'k1' });
  ok(spy.exp === 0 && spy.cmp === 0 && spy.loot === 0, '시련: 처치해도 경험치·동료 경험치·전리품 없음', spy);
  ok(hits.includes('kill:k1') && wk.run.kills === 1, 'onKill: 영웅이 처치 → 부름');
  hits.length = 0; World.prototype.onEnemyKilled.call(wk, { def: { id: 'bat' }, stats: { exp: 5 } }, { owner: {}, tag: 'k2' });
  ok(!hits.length, 'onKill: 다른 주인(동료 등)의 처치는 부르지 않음');
  for (const [keep, want] of [[[() => true], false], [[() => false], true], [[], true]]) {
    let ended = 0;
    const wh = { combo: { n: 5 }, run: { damageTaken: 0 }, endCombo() { ended++; }, style: null, game: {}, player: { stats: { hp: 100 }, perks: keep.length ? { keepCombo: keep } : {} }, addAw() {} };
    World.prototype.onPlayerHurt.call(wh, 3);
    ok((ended > 0) === want, `keepCombo ${keep.length ? keep[0]() : '없음'} → 콤보 ${want ? '끊김' : '유지'}`);
  }
  ok(World.prototype.spawnPickup.call({ trial: {}, add: (e) => e }, 'gold', 0, 0, {}) === null && World.prototype.spawnPickup.call({ trial: {}, add: (e) => e }, 'item', 0, 0, {}) === null, '시련: 골드·아이템 줍기 없음 (null)');
  ok(World.prototype.spawnPickup.call({ trial: {}, add: (e) => e }, 'heart', 0, 0, {})?.type === 'heart' && World.prototype.spawnPickup.call({ trial: null, add: (e) => e }, 'gold', 0, 0, {})?.type === 'gold', '시련: 하트는 생김 · 시련 아니면 골드도');
  const ph = { trial: {}, arcade: false, entities: [{ kind: 'pickup' }], game: { toast() {} }, state: {} };
  ok(World.prototype.stashRoomLoot.call(ph) === 0 && World.prototype.deliverStash.call(ph) === 0, '시련: 보관함 맡기기·꺼내기 없음');
  // combat C10
  const dz = computeDamage({ atk: 50, holy: 0 }, { stats: { resHoly: 100 } }, { element: 'holy', mv: 1, type: 'phys' });
  const d8 = computeDamage({ atk: 50, holy: 0 }, { stats: { resHoly: 95 } }, { element: 'holy', mv: 1, type: 'phys' });
  ok(dz.dmg === 0 && d8.dmg > 0, '신성 저항 100 = 무효, 95 = 80% 상한', { dz: dz.dmg, d8: d8.dmg });
}

// ══════════════ 6. PerkLayer ══════════════
section('PerkLayer (§3.7)');
{
  const K = PERK.K;
  const noop = () => {};
  // 가짜 ctx (평범한 객체 — 그리기 호출 자체의 비용은 빼고 레이어가 쓰는 시간을 본다). 브라우저의 K.glow 는 캐시 스프라이트 한 장(drawImage)이라
  // 표식은 drawImage 1 + 선 3 으로 흉내 낸다 (node 에는 캔버스가 없어 K.glow 는 그라디언트 대체 경로로 간다 — 아래 한 번만 부른다)
  const ctx = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  for (const k of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'drawImage', 'fillRect', 'strokeRect', 'translate', 'rotate', 'scale', 'setTransform']) ctx[k] = noop;
  ctx.createRadialGradient = ctx.createLinearGradient = () => ({ addColorStop: noop });
  const SPRITE = {};
  const drawn = [];
  const MARKS = {
    t: (c, e, n, k) => {
      drawn.push(e.id);
      const ga = c.globalAlpha; c.globalAlpha = ga * 0.6 * k; c.drawImage(SPRITE, e.cx - 14, e.cy - 54, 28, 28); c.globalAlpha = ga;
      c.strokeStyle = '#ff7a2a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(e.cx - 6, e.cy); c.lineTo(e.cx + 6, e.cy); c.stroke();
      c.beginPath(); c.arc(e.cx, e.cy, 9, 0, 6.28); c.stroke();
      c.beginPath(); c.moveTo(e.cx, e.cy - 6); c.lineTo(e.cx, e.cy + 6); c.stroke();
    },
  };
  K.glow(ctx, 0, 0, 14, '#ff7a2a', 0.5);   // 도구 모음이 묶였는지 (node 대체 경로)
  let meter = 0;
  PERK.setPerkRegistry({ 'char:kael': { drawMeter: () => { meter++; }, onEnter: () => { enter++; }, prewarm: () => { warm++; } } }, MARKS);
  let enter = 0, warm = 0;
  const mkWorld = (hero) => {
    const w = { time: 0, entities: [], camera: { x: 0, y: 0, vw: 960, vh: 540 }, add(e) { e.world = this; this.entities.push(e); return e; } };
    w.player = { hero, dead: false, perks: PERK.perksOf(hero), world: w };
    return w;
  };
  // 특성 없는 영웅: 레이어 없음
  const w0 = mkWorld({ charId: 'victor', classId: 'victor_hellfire' });
  ok(PERK.perkEnter(w0) === false && w0.entities.length === 0, '특성 없는 영웅: perkEnter 는 아무것도 붙이지 않음 (비용 0)');
  const w1 = mkWorld({ charId: 'kael', classId: 'kael_templar' });
  ok(PERK.perkEnter(w1) === true && w1.entities.filter((e) => e.perkLayer).length === 1 && enter === 1 && warm === 1, 'perkEnter: prewarm·onEnter 한 번 + PerkLayer 하나', { enter, warm, n: w1.entities.length });
  ok(PERK.perkEnter(w1) === false && w1.entities.length === 1, '같은 방 불러오기에 두 번 → 한 번만');
  w1.entities = [w1.player]; PERK.perkEnter(w1);
  ok(warm === 1 && enter === 2 && w1.entities.filter((e) => e.perkLayer).length === 1, '새 방(entities 새 배열): onEnter 다시 · prewarm 은 월드·특성마다 한 번 · 레이어 다시', { warm, enter });
  const layer = w1.entities.find((e) => e.perkLayer);
  layer.update(1 / 60, w1);
  ok(layer.x === 0 && layer.w === 960 && layer.h === 540 && layer.z === 9 && !layer.dead, '레이어는 화면 전체를 덮고 z 9 · 죽지 않음');
  // 표식 30개 → 24개만, 만료·죽은 적은 빠짐
  const foes = Array.from({ length: 30 }, (_, i) => w1.add({ id: i, cx: i * 30, cy: 200, kind: 'enemy' }));
  for (const f of foes) PERK.mark(f, 't', 2);
  drawn.length = 0; meter = 0;
  PERK.drawPerkLayer(ctx, layer, w1);
  ok(drawn.length === 24 && meter === 1, `표식 상한 ${PERK.MARK_CAP} · drawMeter 한 번`, { drawn: drawn.length, meter });
  foes[0].dead = true; foes[1].dead = true; w1.time = 0.5;
  PERK.drawPerkLayer(ctx, layer, w1);
  ok(PERK.markedCount() === 28, '죽은 적은 표식 목록에서 빠짐', PERK.markedCount());
  w1.time = 3;
  drawn.length = 0; PERK.drawPerkLayer(ctx, layer, w1);
  ok(drawn.length === 0 && PERK.markedCount() === 0, '만료된 표식은 그리지 않고 목록에서 빠짐');
  // 예산: 표식 24개 + 게이지
  for (const f of foes.slice(2, 26)) PERK.mark(f, 't', 1e6);
  for (let i = 0; i < 500; i++) PERK.drawPerkLayer(ctx, layer, w1);
  let per = Infinity;
  for (let rep = 0; rep < 5; rep++) {   // 가장 빠른 묶음 (다른 프로세스가 CPU 를 나눠 쓰는 잡음 빼기)
    const N = 1000, t0 = performance.now();
    for (let i = 0; i < N; i++) PERK.drawPerkLayer(ctx, layer, w1);
    per = Math.min(per, (performance.now() - t0) / N);
  }
  ok(per < 0.05, `그리기 예산: 표식 24개 ${per.toFixed(4)} ms/프레임 < 0.05 ms (node, 가짜 ctx)`);
  ok(Math.abs(ctx.globalAlpha - 1) < 1e-9 && ctx.globalCompositeOperation === 'source-over', '그린 뒤 globalAlpha·합성 모드 되돌림');
  // 버스: ultimateCast → onUlt (지금 월드) · roomEntered → 한 박자 뒤 perkEnter
  let ult = 0;
  PERK.setPerkRegistry({ 'char:kael': { onUlt: () => { ult++; }, onEnter: () => { enter++; } } });
  const w2 = mkWorld({ charId: 'kael', classId: 'kael_templar' });
  globalThis.__game = { world: w2 };
  bus.emit('ultimateCast', { charId: 'kael', tier: 2, classId: 'kael_templar', asc: null });
  bus.emit('ultimateCast', { charId: 'sera', tier: 2, classId: 'sera_saint', asc: null });
  ok(ult === 1, 'ultimateCast → 지금 영웅의 onUlt (다른 영웅 payload 는 무시)', ult);
  const e0n = enter;
  bus.emit('roomEntered', { stageId: 's01', roomId: 'r1' }); bus.emit('stageEntered', { stageId: 's01' });
  ok(enter === e0n, 'roomEntered: 그 자리에서는 아직 (World 생성 도중)');
  await Promise.resolve(); await Promise.resolve();
  ok(enter === e0n + 1, 'roomEntered + stageEntered → 한 박자 뒤 onEnter 한 번', enter - e0n);
  delete globalThis.__game;
  PERK.setPerkRegistry(null);
}

console.log(`${fails ? '✗' : '✓'} test_perks: ${passes} 통과, ${fails} 실패${warns ? `, 경고 ${warns}` : ''}`);
process.exit(fails ? 1 : 0);
