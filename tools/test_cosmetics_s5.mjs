// Stage 5 보상 장부 (K1, /tmp/claude-0/s5/plan.md §3) 시험 — node tools/test_cosmetics_s5.mjs (Node 만, 브라우저 없음)
//  - 새 need 키 { tw: n } (meta.towerBest 어느 난이도든 n 층) · { nm: n } (meta.nm.clears) 가 문턱에서 풀리고 한 칸 아래에서는 잠긴다
//  - 옛 세이브(meta.nm 없음·망가짐·towerBest 없음)는 잠김으로 읽히고 예외가 없다
//  - Stage 5 항목: 무한의 탑 이정표 10·20·30·40·50 (모두 tw) · 「악몽」 잔상 3 (nm) · 이정표 표(TOWER_MILESTONES)가 장부와 맞다
//  - 조건 글(needText)·고르기(setTrail)·런타임 색(trailRamp)이 새 항목에도 맞다 · 옛 키 { tower } { ach } { ng } 는 그대로
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import(pathToFileURL(path.join(ROOT, 'src/data/cosmetics.js')).href);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const ctxOf = (meta, states = []) => C.cosContext(meta, states);
const tb = (floor, diff = 'normal') => ({ towerBest: { [diff]: { floor, time: 1000 } } });

test('장부: Stage 5 항목 (탑 이정표 5 · 악몽 3) 과 이정표 표', () => {
  const tw = C.TRAIL_IDS.filter((id) => typeof C.TRAILS[id].need?.tw === 'number').map((id) => C.TRAILS[id].need.tw).sort((a, b) => a - b);
  assert.deepEqual(tw, [10, 20, 30, 40, 50], '탑 이정표 tw');
  const nm = C.TRAIL_IDS.filter((id) => typeof C.TRAILS[id].need?.nm === 'number');
  assert.equal(nm.length, 3, '악몽 잔상 3');
  assert.deepEqual(nm.map((id) => C.TRAILS[id].need.nm).sort((a, b) => a - b), [1, 10, 26]);   // 군주 = 악몽 26 모두 (외전 26장 s26 — ch26_verify)
  assert.deepEqual(C.TOWER_MILESTONES.map((m) => m.floor), [10, 20, 30, 40, 50]);
  for (const m of C.TOWER_MILESTONES) assert.equal(C.TRAILS[m.trail]?.need?.tw, m.floor, `이정표 ${m.floor} → ${m.trail}`);
  // 모든 잔상: 이름·설명·6단 색(#rrggbb)·알려진 need 키 하나
  const KEYS = ['ach', 'tower', 'tw', 'nm', 'ng'];
  for (const id of C.TRAIL_IDS) {
    const t = C.TRAILS[id];
    assert.ok(t.name && t.desc, `${id} 이름·설명`);
    assert.equal(t.ramp.length, 6, `${id} ramp 6`);
    for (const c of t.ramp) assert.match(c, /^#[0-9a-f]{6}$/i, `${id} 색 ${c}`);
    assert.equal(Object.keys(t.need).filter((k) => KEYS.includes(k)).length, 1, `${id} need 키 하나`);
  }
  assert.equal(new Set(C.TRAIL_IDS.map((id) => C.TRAILS[id].name)).size, C.TRAIL_IDS.length, '이름 겹침 없음');
});

test('tw: 문턱에서 풀리고 한 칸 아래에서는 잠김 (난이도 중 최대 층)', () => {
  for (const id of C.TRAIL_IDS.filter((i) => typeof C.TRAILS[i].need.tw === 'number')) {
    const n = C.TRAILS[id].need.tw;
    assert.equal(C.ownsTrail(id, ctxOf(tb(n))), true, `${id} ${n}층 → 풀림`);
    assert.equal(C.ownsTrail(id, ctxOf(tb(n - 1))), false, `${id} ${n - 1}층 → 잠김`);
    assert.equal(C.ownsTrail(id, ctxOf(tb(n + 7, 'inferno'))), true, `${id} 다른 난이도도 센다`);
    // 여러 난이도: 가장 높은 층
    assert.equal(C.ownsTrail(id, ctxOf({ towerBest: { easy: { floor: n - 1 }, hard: { floor: n } } })), true);
    assert.equal(C.ownsTrail(id, ctxOf({ towerBest: { easy: { floor: n - 1 }, hard: { floor: n - 3 } } })), false);
  }
});

test('nm: meta.nm.clears 문턱에서 풀리고 한 칸 아래에서는 잠김', () => {
  for (const id of C.TRAIL_IDS.filter((i) => typeof C.TRAILS[i].need.nm === 'number')) {
    const n = C.TRAILS[id].need.nm;
    assert.equal(C.ownsTrail(id, ctxOf({ nm: { clears: n } })), true, `${id} ${n}승 → 풀림`);
    assert.equal(C.ownsTrail(id, ctxOf({ nm: { clears: n - 1 } })), false, `${id} ${n - 1}승 → 잠김`);
  }
  assert.equal(ctxOf({ nm: { clears: 3.9 } }).nm, 3, '소수는 내림');
});

test('옛 세이브: meta.nm 없음·망가짐·towerBest 없음 → 잠김, 예외 없음', () => {
  const metas = [undefined, null, {}, { nm: null }, { nm: 5 }, { nm: [] }, { nm: 'x' }, { nm: { clears: '9' } }, { nm: { clears: NaN } }, { nm: { clears: -4 } },
    { nm: { clears: Infinity } }, { towerBest: null }, { towerBest: [] }, { towerBest: { normal: null } }, { towerBest: { normal: { floor: '30' } } }, { ach: null }];
  for (const m of metas) {
    let ctx;
    assert.doesNotThrow(() => { ctx = ctxOf(m, [null, undefined, 7, { arcade: true }]); }, JSON.stringify(m));
    for (const id of C.TRAIL_IDS) {
      const need = C.TRAILS[id].need;
      if (typeof need.tw === 'number' || typeof need.nm === 'number') assert.equal(C.ownsTrail(id, ctx), false, `${id} @ ${JSON.stringify(m)}`);
    }
  }
  // 화면의 예비 문맥 (front/achievements.js readCos 실패 시 { got, tower, ng } — tw·nm 이 없다)
  const fb = { got: {}, tower: 0, ng: 0 };
  for (const id of C.TRAIL_IDS) assert.doesNotThrow(() => C.ownsTrail(id, fb));
  assert.equal(C.ownsTrail('tr_moss', { got: {}, tower: 10, ng: 0 }), true, 'tw 가 없으면 tower 로 읽는다');
  assert.equal(C.needMet({ nm: 1 }, null), false);
  assert.equal(C.needMet({ nm: 'a' }, { nm: 99 }), false, '숫자가 아닌 문턱 → 거짓');
  assert.equal(C.needMet({ zz: 1 }, { zz: 99 }), false, '모르는 키 → 거짓');
});

test('옛 키는 그대로: ach · tower · ng', () => {
  assert.equal(C.needMet({ tower: 30 }, ctxOf(tb(30))), true);
  assert.equal(C.needMet({ tower: 30 }, ctxOf(tb(29))), false);
  assert.equal(C.needMet({ ach: 'st_dracula' }, ctxOf({ ach: { got: { st_dracula: 1 } } })), true);
  assert.equal(C.needMet({ ach: 'st_dracula' }, ctxOf({ ach: { got: {} } })), false);
  assert.equal(C.needMet({ ng: 1 }, ctxOf({}, [{ ng: { n: 1 } }])), true);
  assert.equal(C.needMet({ ng: 1 }, ctxOf({}, [{ ng: { n: 1 }, arcade: true }])), false, '아케이드 임시 세이브는 세지 않는다');
  assert.equal(C.ownsTrail(null, ctxOf({})), true, '직업 기본은 늘 참');
});

test('조건 글 · 고르기 · 런타임 색', () => {
  assert.deepEqual(C.needText({ tw: 40 }), { short: '무한의 탑 40층', long: '무한의 탑 40층을 돌파하면 쓸 수 있습니다' });
  assert.deepEqual(C.needText({ tower: 30 }), C.needText({ tw: 30 }), 'tower·tw 같은 글');
  assert.deepEqual(C.needText({ nm: 10 }), { short: '악몽 10승', long: '「악몽」 보스를 10번 쓰러뜨리면 쓸 수 있습니다' });
  for (const id of C.TRAIL_IDS) {
    const t = C.needText(C.TRAILS[id].need, () => '업적');
    assert.ok(t.short && t.long, `${id} 조건 글`);
  }
  const ach = {};
  assert.equal(C.setTrail(ach, 'tr_sovereign'), true);
  assert.equal(C.trailId({ ach }), 'tr_sovereign');
  assert.deepEqual(C.trailRamp({ ach }), C.TRAILS.tr_sovereign.ramp);
  assert.equal(C.setTrail(ach, 'tr_nope'), false);
});

let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log(`✓ ${t.name}`); }
  catch (e) { fail++; console.log(`✗ ${t.name}\n  ${String(e?.stack ?? e).split('\n').slice(0, 4).join('\n  ')}`); }
}
console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
