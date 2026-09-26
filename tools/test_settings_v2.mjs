// 설정 스키마 v2 + 에셋 로더(lo/ 변형·디코딩 LRU·팩) 테스트 (PLAT-SAVE-ASSETS: MASTER_PLAN §1.5/§1.20/§5.2, platform §6.4/§6.7/§10)
// 사용: node tools/test_settings_v2.mjs [--node] (--node: 브라우저 단계 생략)
//  1) DEFAULT_SETTINGS 가 MASTER_PLAN §1.5 표의 모든 키·기본값과 같다 (표를 직접 읽어 비교), 값 열의 허용 값은 통과·범위 밖은 기본값
//  2) migrateSettings: v1 → quality 'auto', 모르는 키 보존, 잘못된 값 → 기본값, settingsVersion 2, 멱등 (퍼징 포함), 프로토타입 키 방어
//  3) saves.loadSettings / saveSettings 왕복 (가짜 localStorage): 이관 결과를 한 번 다시 저장, 저장은 항상 v2
//  4) 계정 훅 유지: onWrite(write/remove/meta/import), store() 는 알림 없음, isValidSave 의 hasOwn 방어
//  5) assets.js (가짜 Image/fetch): url() 의 lo/ 선택(§6.4), 실패 시 원본, 등급 변화 시 교체, LRU(전체·채색·장면 전환), track, 팩 읽기
//  6) 브라우저(헤드리스 Chromium): v1 설정 → 'auto', v2 유지, 모바일 lo/ 선택+대체, 데스크톱은 lo/ 요청 없음, 장면 전환 정리, 내린 이미지 그리기 안전, 팩 읽기
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_ONLY = process.argv.includes('--node');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const section = (t) => console.log('▶ ' + t);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// 가짜 localStorage (save.js 는 호출 시점에 전역 localStorage 를 찾는다)
const LS = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => { LS.set(k, String(v)); }, removeItem: (k) => { LS.delete(k); } },
});

const S = await import(path.join(ROOT, 'src/core/save.js'));
const { DEFAULT_SETTINGS, SETTINGS_SCHEMA, SETTINGS_VERSION, migrateSettings, saves, isValidSave, autoQualityTier } = S;
const KEY = 'bloodnocturne_settings';

// ── 1. §1.5 표 ──
section('DEFAULT_SETTINGS = MASTER_PLAN §1.5');
const plan = fs.readFileSync(path.join(ROOT, 'docs/specs/MASTER_PLAN.md'), 'utf8');
const sec = plan.slice(plan.indexOf('### 1.5 Settings keys'), plan.indexOf('### 1.6 '));
const rows = sec.split('\n').filter((l) => l.startsWith('| ') && !/^\| key \|/.test(l) && !l.startsWith('|---'))
  .map((l) => l.replace(/\\\|/g, '\u0001').split('|').slice(1, -1).map((c) => c.trim().replace(/\u0001/g, '|')));
const lit = (s) => {
  s = s.trim();
  if (/^'.*'$/.test(s)) return s.slice(1, -1);
  if (s === 'true') return true; if (s === 'false') return false; if (s === 'null') return null;
  const n = Number(s); return Number.isFinite(n) ? n : Symbol(s);
};
ok(rows.length >= 30, `§1.5 표 행 수 ${rows.length}`);
const tableKeys = new Set();
for (const [key, dflt, values] of rows) {
  const k = key.replace(/`/g, '');
  tableKeys.add(k);
  ok(Object.hasOwn(DEFAULT_SETTINGS, k), `DEFAULT_SETTINGS 에 ${k} 없음`);
  ok(isDeepStrictEqual(DEFAULT_SETTINGS[k], lit(dflt)), `${k} 기본값 ${JSON.stringify(DEFAULT_SETTINGS[k])} ≠ 표 ${dflt}`);
  if (k === 'settingsVersion') continue;
  ok(Object.hasOwn(SETTINGS_SCHEMA, k), `SETTINGS_SCHEMA 에 ${k} 없음`);
  // 값 열: 허용 값은 그대로, 범위 밖·형식 틀림은 기본값
  const base = { settingsVersion: 2 };
  const keep = (v) => migrateSettings({ ...base, [k]: v }).settings[k];
  const range = values.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
  if (range) {
    const lo = Number(range[1]), hi = Number(range[2]);
    ok(keep(lo) === lo && keep(hi) === hi && keep((lo + hi) / 2) === (lo + hi) / 2, `${k}: 범위 ${values} 안의 값 유지`);
    ok(keep(hi + 0.5) === DEFAULT_SETTINGS[k] && keep(lo - 0.5) === DEFAULT_SETTINGS[k], `${k}: 범위 밖 → 기본값`);
    ok(keep('0.5') === DEFAULT_SETTINGS[k] && keep(NaN) === DEFAULT_SETTINGS[k], `${k}: 숫자 아님 → 기본값`);
    ok(keep(hi + 1e-9) === hi, `${k}: 부동소수 오차는 범위로 맞춘다`);
  } else if (values === 'bool') {
    ok(keep(true) === true && keep(false) === false, `${k}: bool 유지`);
    ok(keep('true') === DEFAULT_SETTINGS[k] && keep(1) === DEFAULT_SETTINGS[k], `${k}: bool 아님 → 기본값`);
  } else if (!values.startsWith('{')) {
    const opts = values.split('|').map(lit);
    for (const v of opts) ok(keep(v) === v, `${k}: 허용 값 ${JSON.stringify(v)} 유지`);
    ok(keep('없는값') === DEFAULT_SETTINGS[k] && keep(12345) === DEFAULT_SETTINGS[k], `${k}: 목록 밖 → 기본값`);
  }
}
for (const k of Object.keys(DEFAULT_SETTINGS)) ok(tableKeys.has(k), `DEFAULT_SETTINGS 의 ${k} 가 §1.5 표에 없음`);
for (const k of Object.keys(SETTINGS_SCHEMA)) ok(Object.hasOwn(DEFAULT_SETTINGS, k), `SETTINGS_SCHEMA 의 ${k} 에 기본값 없음`);
ok(SETTINGS_VERSION === 2 && DEFAULT_SETTINGS.settingsVersion === 2, 'settingsVersion 2');
ok(['low', 'medium', 'high'].includes(autoQualityTier()), 'autoQualityTier() 는 low|medium|high');
ok(S.detectQuality === autoQualityTier, 'detectQuality 는 autoQualityTier 별칭');

// ── 2. 이관 ──
section('migrateSettings');
{
  const v1 = { musicVol: 0.3, sfxVol: 1, quality: 'medium', vibration: false, screenShake: 0.5, showDamage: false, touchOpacity: 0.4, autoSave: false, language: 'ko', painted: false, futureKey: { a: 1 } };
  const { settings: m, changed } = migrateSettings(v1);
  ok(changed, 'v1 → changed');
  ok(m.settingsVersion === 2, 'v1 → settingsVersion 2');
  ok(m.quality === 'auto', `v1 quality 'medium' → 'auto' (${m.quality})`);
  for (const k of ['musicVol', 'sfxVol', 'vibration', 'screenShake', 'showDamage', 'touchOpacity', 'autoSave', 'language']) ok(m[k] === v1[k], `v1 ${k} 유지`);
  ok(m.painted === false && isDeepStrictEqual(m.futureKey, { a: 1 }), '모르는 키(painted, futureKey) 보존');
  for (const k of Object.keys(DEFAULT_SETTINGS)) ok(Object.hasOwn(m, k), `이관 결과에 ${k}`);
  ok(m.flashFx === 1 && m.cutinMode === 'full' && m.autoSprint === false && m.fpsCap === 60, '새 키는 기본값');
  const again = migrateSettings(m);
  ok(!again.changed && isDeepStrictEqual(again.settings, m), '멱등 (두 번째는 changed=false, 같은 결과)');
  ok(migrateSettings({ quality: 'high' }).settings.quality === 'auto', "v1 'high' 도 'auto'");
  ok(migrateSettings({ settingsVersion: 1, quality: 'low' }).settings.quality === 'auto', "settingsVersion 1 → 'auto'");
  ok(migrateSettings({ settingsVersion: '2', quality: 'low' }).settings.quality === 'auto', "문자열 '2' 는 v1 취급");
  const v2 = migrateSettings({ settingsVersion: 2, quality: 'low', uiScale: 1.15, fpsCap: 0 });
  ok(v2.settings.quality === 'low' && v2.settings.uiScale === 1.15 && v2.settings.fpsCap === 0 && !v2.changed, 'v2 선택 유지, changed=false');
  ok(migrateSettings({ settingsVersion: 3, quality: 'low' }).settings.settingsVersion === 3, '미래 판(3)은 낮추지 않는다');
  ok(migrateSettings({ settingsVersion: 2, uiScale: 1.1500000001 }).settings.uiScale === 1.15, '숫자 목록 값은 오차 허용 후 정규화');
  ok(migrateSettings({ settingsVersion: 2, screenShake: 1.5 }).settings.screenShake === 1, '예전 화면 흔들림 1.5 → 기본값 1');
  for (const bad of [null, undefined, 42, 'str', [1, 2], true]) {
    const r = migrateSettings(bad);
    ok(isDeepStrictEqual(r.settings, { ...DEFAULT_SETTINGS }), `손상 입력 ${JSON.stringify(bad)} → 기본값`);
  }
  ok(migrateSettings(null).changed === false && migrateSettings([1]).changed === true, 'null 은 changed=false, 배열은 true');
  // 프로토타입 키
  const evil = JSON.parse('{"settingsVersion":2,"__proto__":{"polluted":1},"constructor":{"x":1},"ctrlMap":{"__proto__":[1],"jump":[0,"bad key!",99]},"touchLayout":{"__proto__":{"right":1,"bottom":1,"d":50},"attack":{"right":108,"bottom":58,"d":72,"x":"y"},"jump":{"right":"a"}}}');
  const r = migrateSettings(evil).settings;
  ok(!('polluted' in {}) && Object.getPrototypeOf(r) === Object.prototype && !Object.hasOwn(r, '__proto__') && !Object.hasOwn(r, 'constructor'), '__proto__/constructor 키 버림');
  ok(isDeepStrictEqual(r.ctrlMap, { jump: [0] }), `ctrlMap 정리 ${JSON.stringify(r.ctrlMap)}`);
  ok(isDeepStrictEqual(r.touchLayout, { attack: { right: 108, bottom: 58, d: 72 } }), `touchLayout 정리 ${JSON.stringify(r.touchLayout)}`);
  ok(migrateSettings({ settingsVersion: 2, keyMap: { jump: ['KeyZ', 'Space', 7, 'a b'] } }).settings.keyMap.jump.join() === 'KeyZ,Space', 'keyMap: 코드 문자열만');
  ok(migrateSettings({ settingsVersion: 2, keyMap: [1] }).settings.keyMap === null && migrateSettings({ settingsVersion: 2, ctrlMap: 'x' }).settings.ctrlMap === null, 'map 형식 틀림 → null');
  // 퍼징: 멱등 + 모든 알려진 키가 스키마 통과
  const pool = [0, 1, -1, 0.5, 1.15, 60, 99, NaN, Infinity, '', 'auto', 'low', 'full', 'ko', true, false, null, [], {}, { a: [1] }, { b: { right: 1, bottom: 2, d: 50 } }];
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let fuzzOk = true;
  for (let i = 0; i < 400; i++) {
    const o = rnd() < 0.5 ? { settingsVersion: 2 } : {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (rnd() < 0.6) o[k] = pool[Math.floor(rnd() * pool.length)];
    const a = migrateSettings(o).settings, b = migrateSettings(a);
    if (b.changed || !isDeepStrictEqual(a, b.settings) || !(Number.isInteger(a.settingsVersion) && a.settingsVersion >= 2)) { fuzzOk = false; console.log('    퍼징 실패', JSON.stringify(o)); break; }
    for (const k of Object.keys(SETTINGS_SCHEMA)) if (!isDeepStrictEqual(migrateSettings({ settingsVersion: 2, [k]: a[k] }).settings[k], a[k])) { fuzzOk = false; console.log('    스키마 밖 값', k, a[k]); }
  }
  ok(fuzzOk, '퍼징 400회: 멱등, 결과는 항상 스키마 안');
}

// ── 3. loadSettings / saveSettings ──
section('saves.loadSettings / saveSettings');
{
  LS.clear();
  const fresh = saves.loadSettings();
  ok(isDeepStrictEqual(fresh, { ...DEFAULT_SETTINGS }) && !LS.has(KEY), '저장된 설정 없음 → 기본값, 쓰지 않음');
  ok(saves.settings === fresh, 'saves.settings 는 마지막으로 불러온 객체');
  LS.set(KEY, JSON.stringify({ quality: 'medium', musicVol: 0.2, painted: false }));
  const s = saves.loadSettings();
  ok(s.quality === 'auto' && s.musicVol === 0.2 && s.painted === false, `v1 {quality:'medium'} → 'auto' (${s.quality})`);
  const stored = JSON.parse(LS.get(KEY));
  ok(stored.settingsVersion === 2 && stored.quality === 'auto' && stored.musicVol === 0.2, '이관 결과를 다시 저장');
  s.quality = 'medium';
  saves.saveSettings(s);
  ok(saves.loadSettings().quality === 'medium', "v2 로 저장한 'medium' 은 유지 (다시 초기화되지 않음)");
  const noVer = { ...s }; delete noVer.settingsVersion; noVer.quality = 'low';
  saves.saveSettings(noVer);
  ok(JSON.parse(LS.get(KEY)).settingsVersion === 2 && saves.loadSettings().quality === 'low', 'saveSettings 는 settingsVersion 없는 객체도 v2 로 기록');
  ok(!Object.hasOwn(noVer, 'settingsVersion'), 'saveSettings 는 넘겨받은 객체를 바꾸지 않는다');
  LS.set(KEY, '{깨진 json');
  const c = saves.loadSettings();
  ok(isDeepStrictEqual(c, { ...DEFAULT_SETTINGS }) && JSON.parse(LS.get(KEY)).settingsVersion === 2, '손상된 JSON → 기본값으로 다시 저장');
  const before = LS.get(KEY);
  saves.loadSettings();
  ok(LS.get(KEY) === before, '변경 없으면 다시 쓰지 않음');
  ok(saves.saveSettings(null) === false, 'saveSettings(null) → false');
}

// ── 4. 계정 훅·세이브 검증 유지 ──
section('save.js: 계정 훅 (onWrite) · isValidSave');
{
  LS.clear();
  const ev = [];
  const off = saves.onWrite((e) => ev.push(e));
  const state = { charId: 'kael', heroes: { kael: { level: 1, equip: {} } }, inventory: [], progress: { chapter: 1 } };
  ok(isValidSave(state), '최소 세이브는 유효');
  saves.write(1, state);
  saves.remove(1);
  saves.saveMeta({ a: 1 });
  const code = (saves.write(2, state), saves.exportCode(2));
  ev.length = 0;
  ok(saves.importCode(3, code) === true, '가져오기 코드 왕복');
  ok(ev.length === 1 && ev[0].type === 'write' && ev[0].slot === 3, `가져오기 → onWrite write 3 (${JSON.stringify(ev)})`);
  ev.length = 0;
  saves.write(1, state); saves.remove(1); saves.saveMeta({});
  ok(ev.map((e) => e.type).join() === 'write,remove,meta', `onWrite 순서 ${ev.map((e) => e.type)}`);
  ev.length = 0;
  ok(saves.store(1, JSON.parse(JSON.stringify(state))) === true && ev.length === 0, 'store() 는 알림 없음');
  ok(saves.store(1, { bad: true }) === false, 'store() 는 잘못된 기록 거부');
  saves.onWrite(() => { throw new Error('구독자 오류'); });
  const ce = console.error; console.error = () => {};
  let threw = false; try { saves.write(1, state); } catch { threw = true; } finally { console.error = ce; }
  ok(!threw, '구독자 오류가 저장을 막지 않음');
  off();
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nobody']) {
    ok(!isValidSave({ ...state, charId: id }), `charId '${id}' 거부 (hasOwn)`);
  }
  ok(!isValidSave(JSON.parse('{"charId":"kael","heroes":{"kael":{"level":1,"equip":{}},"__proto__":{"level":1,"equip":{}}},"inventory":[],"progress":{}}')), "heroes['__proto__'] 거부");
  ok(!isValidSave({ ...state, heroes: { kael: { level: 'x', equip: {} } } }), '레벨이 숫자가 아니면 거부');
  ok(saves.list().length === 3, 'list() 3 슬롯');
}

// ── 5. assets.js (Node, 가짜 Image) ──
section('assets.js: lo/ 선택 · LRU · track · 팩');
const IMG = [];                 // 만들어진 가짜 이미지
const SERVE = new Map();        // 경로 → [w, h] (없으면 404). blob:·data: 는 1×1 또는 BLOBDIM
const BLOBDIM = new Map();
let FETCHES = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this._src = ''; this.naturalWidth = 0; this.naturalHeight = 0; this.decoding = ''; IMG.push(this); }
  get src() { return this._src; }
  set src(u) {
    this._src = u;
    setTimeout(() => {
      if (this._src !== u) return;
      const p = u.split('?')[0];
      const d = u.startsWith('blob:') ? (BLOBDIM.get(u) ?? [1, 1]) : u.startsWith('data:') ? [1, 1] : SERVE.get(p);
      if (d) { this.naturalWidth = d[0]; this.naturalHeight = d[1]; this.onload?.(); } else this.onerror?.();
    }, 1);
  }
}
globalThis.Image = FakeImage;
const A = await import(path.join(ROOT, 'src/core/assets.js'));
const Assets = A.assets.constructor;
const mk = () => new Assets();
const env = (tier, backingH) => () => ({ tier, backingH });
const MB = 1048576;
{
  // url(): lo/ 선택 (§6.4)
  let a = mk();
  a.setEnv(env('low', 400));
  ok(a.url('bg/s01_village') === 'assets/bg/s01_village.webp?v=2', 'lo 파일 목록이 없으면 low 에서도 원본');
  a.useVariants(true);
  ok(a.url('bg/s01_village') === 'assets/lo/bg/s01_village.webp?v=2', `low → lo/ (${a.url('bg/s01_village')})`);
  ok(a.url('cg/cg_x').startsWith('assets/lo/cg/') && a.url('portraits/kael').startsWith('assets/lo/portraits/'), 'cg/·portraits/ 도 lo/');
  ok(a.url('tex/tex_a') === 'assets/tex/tex_a.webp?v=2' && a.url('puppets/kael/k/atlas_lo', 'h1') === 'assets/puppets/kael/k/atlas_lo.webp?v=2&h=h1' && a.url('icons/x') === 'assets/icons/x.png?v=2', 'tex/puppets/icons 는 lo/ 없음 (ver 해시 유지)');
  a.setEnv(env('medium', 585)); ok(a.url('bg/a').includes('/lo/'), 'medium + 백킹 585 ≤ 640 → lo/');
  a.setEnv(env('medium', 640)); ok(a.url('bg/a').includes('/lo/'), 'medium + 백킹 640 → lo/');
  a.setEnv(env('medium', 900)); ok(!a.url('bg/a').includes('/lo/'), 'medium + 백킹 900 → 원본');
  a.setEnv(env('high', 400)); ok(!a.url('bg/a').includes('/lo/'), 'high → 원본');
  a.setVariantMode('lo'); ok(a.url('bg/a').includes('/lo/'), "setVariantMode('lo') 강제");
  a.setVariantMode('full'); a.setEnv(env('low', 300)); ok(!a.url('bg/a').includes('/lo/'), "setVariantMode('full') 끔");
  a.setVariantMode('auto');
  a.useVariants(['bg/a', 'assets/lo/bg/b.webp']);
  ok(a.url('bg/a').includes('/lo/') && a.url('bg/b').includes('/lo/') && !a.url('bg/c').includes('/lo/'), 'useVariants(키 목록): 목록에 있는 키만 (경로·확장자 정규화)');

  // 로드: lo 실패 → 원본으로 대체
  a = mk(); a.setEnv(env('low', 400)); a.useVariants(true);
  SERVE.set('assets/bg/full_only.webp', [1000, 500]);
  SERVE.set('assets/lo/bg/both.webp', [600, 300]); SERVE.set('assets/bg/both.webp', [1000, 500]);
  const i1 = await a.load('bg/full_only'), i2 = await a.load('bg/both');
  ok(i1 && i1.naturalWidth === 1000 && a.loMiss.has('bg/full_only') && a.loFallbacks === 1, 'lo/ 404 → 원본으로 대체, 다시 시도하지 않음');
  ok(i2 && i2.naturalWidth === 600 && a.cache.get('bg/both').lo === true, 'lo/ 있으면 lo/ 사용');
  ok(a.total === (1000 * 500 + 600 * 300) * 4 && a.groups.bg === a.total, `디코딩 바이트 = w·h·4 (${a.total})`);
  ok(a.url('bg/full_only') === 'assets/bg/full_only.webp?v=2', '대체된 키는 url() 도 원본');
  ok(a.get('bg/nope') === null, '없는 키 get() → null');
  await a.load('bg/nope');
  ok(a.failed('bg/nope') && !a.has('bg/nope') && a.exists('bg/nope') === false, '없는 파일: failed, has=false, exists=false');
  ok(a.has('bg/both') && a.exists('bg/both') === true && a.exists('bg/unknown') === undefined, 'has / exists');

  // 등급 변화 → 조용히 교체 (그동안 이전 이미지)
  a.setEnv(env('high', 1000));
  const old = a.get('bg/both');
  ok(old === i2, '교체 중에는 기존 이미지를 준다');
  await tick(10);
  const nw = a.get('bg/both');
  ok(nw && nw !== i2 && nw.naturalWidth === 1000 && a.cache.get('bg/both').lo === false, 'high 로 바뀌면 원본으로 교체');
  ok(i2.src.startsWith('blob:') || i2.src.startsWith('data:'), '교체된 이미지는 1×1 빈 이미지로 해제');
  ok(a.total === (1000 * 500 + 1000 * 500) * 4, '교체 후 바이트 갱신');

  // LRU: 전체 예산
  a = mk(); a.setEnv(env('high', 1000));
  for (const k of ['bg/l1', 'bg/l2', 'bg/l3', 'portraits/p1', 'puppets/h/atlas_hi', 'tex/t1']) SERVE.set(`assets/${k}.webp`, [1024, 1024]);   // 4 MB 씩
  for (const k of ['bg/l1', 'bg/l2', 'bg/l3', 'portraits/p1', 'puppets/h/atlas_hi', 'tex/t1']) await a.load(k);
  ok(a.total === 24 * MB && a.paintedBytes === 4 * MB, `합계 24 MB, 채색(puppets) 4 MB (${a.total / MB}, ${a.paintedBytes / MB})`);
  const T = performance.now();
  a.cache.get('bg/l1').t = T - 60000; a.cache.get('bg/l2').t = T - 50000; a.cache.get('portraits/p1').t = T - 40000;
  a.cache.get('puppets/h/atlas_hi').t = T - 90000; a.cache.get('tex/t1').t = T - 90000; a.cache.get('bg/l3').t = T;
  const l1img = a.cache.get('bg/l1').img;
  a.setBudget({ total: 16 * MB });
  const freed = a.trim(T);
  ok(freed === 12 * MB && a.total === 12 * MB, `예산 16 MB → 13.6 MB 이하까지 LRU 로 내림 (내린 ${freed / MB} MB, 남은 ${a.total / MB} MB)`);
  ok(!a.cache.has('bg/l1') && !a.cache.has('bg/l2') && !a.cache.has('portraits/p1'), '오래된 bg/portraits 부터 내림');
  ok(a.cache.has('bg/l3') && a.cache.has('puppets/h/atlas_hi') && a.cache.has('tex/t1'), '최근 사용·puppets·tex 는 남김');
  ok(l1img.src.startsWith('blob:') || l1img.src.startsWith('data:'), '내린 이미지는 1×1 빈 이미지 (그려도 예외 없음)');
  ok(a.evictions === 3 && a.get('bg/l1') === null && a.cache.has('bg/l1'), '내린 키를 다시 get() 하면 다시 받는다');
  await tick(10);
  ok(a.get('bg/l1')?.naturalWidth === 1024, '다시 받은 이미지');
  // 바깥에서 cache.delete (painted/kit.js 방식)
  const tb = a.total;
  a.cache.delete('tex/t1');
  ok(a.total === tb - 4 * MB && !a.groups.tex, 'cache.delete(key) 는 바이트도 뺀다');
  a.cache.clear();
  ok(a.total === 0, 'cache.clear() → 0 바이트');

  // track: 채색 예산
  a = mk(); a.setEnv(env('high', 1000));
  a.setBudget({ painted: 10 * MB });
  const rel = [];
  a.track('rig:old', 6 * MB, { group: 'painted', release: (id) => rel.push(id) });
  a.track('rig:new', 6 * MB, { group: 'painted', release: (id) => rel.push(id) });
  a.track('rig:norel', 2 * MB, { group: 'painted' });
  ok(a.paintedBytes === 14 * MB && a.stats().tracked === 3, 'track 합산');
  a.ext.get('rig:old').t = performance.now() - 60000;
  a.trim();
  ok(rel.join() === 'rig:old' && a.paintedBytes === 8 * MB && !a.ext.has('rig:old'), `채색 예산 초과 → 오래된 rig 해제 (${rel})`);
  a.track('rig:new', 3 * MB, { group: 'painted' });
  ok(a.paintedBytes === 5 * MB, 'track 같은 id 로 다시 부르면 바이트 갱신');
  ok(a.untrack('rig:new') && !a.untrack('rig:new') && a.paintedBytes === 2 * MB, 'untrack');
  a.touch('rig:norel');
  ok(performance.now() - a.ext.get('rig:norel').t < 1000, 'touch(id) 는 최근 사용 갱신');
  // 추적 항목도 전체 예산 정리 대상 (release 있을 때)
  a.setBudget({ total: 4 * MB, painted: 100 * MB });
  a.track('cmp:x', 8 * MB, { group: 'cmp', release: (id) => rel.push(id) });
  a.ext.get('cmp:x').t = performance.now() - 60000;
  a.trim();
  ok(rel.includes('cmp:x') && a.total === 2 * MB, '전체 예산 초과 → release 있는 추적 항목도 내림');
  // 자동 정리 예약: 로드가 예산을 넘기면 다음 틱에 trim (최근 사용은 보호)
  a = mk(); a.setEnv(env('high', 1000)); a.setBudget({ total: 6 * MB });
  await a.load('bg/l1'); a.cache.get('bg/l1').t = performance.now() - 60000;
  await a.load('bg/l2'); await tick(5);
  ok(!a.cache.has('bg/l1') && a.cache.has('bg/l2') && a.total === 4 * MB, '로드 후 예산 초과 → 자동 정리 (오래된 것만)');

  // 장면 전환
  a = mk(); a.setEnv(env('high', 1000)); a.setBudget({ total: 20 * MB });   // 장면 몫 30 % = 6 MB
  for (const k of ['bg/l1', 'bg/l2', 'bg/l3']) await a.load(k);
  const t0 = performance.now();
  for (const k of ['bg/l1', 'bg/l2', 'bg/l3']) a.cache.get(k).t = t0 - 5000;
  a.sceneChange(['bg/l3']);
  a._poll(performance.now() + 2000);
  ok(!a.cache.has('bg/l1') && !a.cache.has('bg/l2') && a.cache.has('bg/l3'), '장면 전환 → 쓰이지 않은 bg 를 장면 몫(6 MB)까지 내림, keep 은 유지');

  // 팩
  a = mk(); a.setEnv(env('low', 400));
  const files = { 'bg/pk.webp': Buffer.from('IMG-FULL-DATA'), 'lo/bg/pk.webp': Buffer.from('IMG-LO'), 'puppets/x/y/rig.json': Buffer.from(JSON.stringify({ parts: { a: 1 }, name: '리그' })) };
  let off = 0; const index = { v: 1, packs: ['0.bnpack'], files: {} };
  const bufs = [];
  for (const [f, b] of Object.entries(files)) { index.files[f] = [0, off, b.length]; off += b.length; bufs.push(b); }
  index.files['__proto__'] = [0, 0, 1];
  const pack = Buffer.concat(bufs);
  const origFetch = globalThis.fetch;
  FETCHES = [];
  globalThis.fetch = async (u) => {
    FETCHES.push(String(u));
    const resp = (body, okk = true) => ({ ok: okk, status: okk ? 200 : 404, json: async () => JSON.parse(body), text: async () => String(body), arrayBuffer: async () => { const b = Buffer.from(body); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
    if (u === 'x/packs/index.json') return resp(JSON.stringify(index));
    if (u === 'x/packs/0.bnpack') return resp(pack);
    return resp('', false);
  };
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = (blob) => { const u = origCreate(blob); BLOBDIM.set(u, blob.size === 6 ? [60, 30] : [100, 50]); return u; };
  try {
    ok(await a.usePack('x/packs/index.json') === true, 'usePack → true');
    const rig = await a.json('puppets/x/y/rig');
    ok(rig?.name === '리그' && a.has('puppets/x/y/rig'), 'json() 을 팩에서 읽음 (UTF-8), has() 는 json 도 본다');
    const im = await a.load('bg/pk');
    ok(im && im.src.startsWith('blob:') && im.naturalWidth === 60, `팩 이미지 → blob: 주소, lo/ 변형이 팩에 있으면 lo (${im?.naturalWidth})`);
    ok(a.url('bg/pk').startsWith('blob:'), 'url() 은 받아 둔 팩 조각이면 blob:');
    ok(FETCHES.filter((u) => u.endsWith('.bnpack')).length === 1, '팩 조각은 한 번만 받음');
    const miss = await a.load('bg/not_in_pack');
    ok(miss === null && a.failed('bg/not_in_pack') && !FETCHES.some((u) => u.includes('not_in_pack')), 'complete 팩에 없는 파일은 네트워크 요청 없이 실패');
    ok(a.exists('bg/pk') === true && a.exists('bg/zzz') === false && a.exists('puppets/x/y/rig') === true, 'exists() 는 팩 목록을 본다');
    ok(await a.json('nothing/here') === null, '팩에 없는 json → null');
    const st = a.stats();
    ok(st.packs.length === 1 && st.packs[0].files === 3 && st.packs[0].ready, `stats().packs (${JSON.stringify(st.packs)})`);
    // 깨진 목록 → 일반 경로로 (complete 아님)
    const b2 = mk(); const ce = console.error; console.error = () => {};
    const okBad = await b2.usePack('x/packs/missing.json'); console.error = ce;
    ok(okBad === false && b2.url('bg/pk') === 'assets/bg/pk.webp?v=2', '팩 목록 실패 → false, 일반 경로 사용');
  } finally { globalThis.fetch = origFetch; URL.createObjectURL = origCreate; }

  // Node 에서 Image 없이도 예외 없음
  delete globalThis.Image;
  const n = mk();
  ok(n.get('bg/x') === null && (await n.load('bg/y')) === null, 'Image 없는 환경(Node): null, 예외 없음');
  globalThis.Image = FakeImage;
  // 기본 예산
  ok(A.ASSET_BUDGET.touch === 160 * MB && A.ASSET_BUDGET.desktop === 400 * MB && A.ASSET_BUDGET.paintedTouch === 24 * MB && A.ASSET_BUDGET.paintedDesktop === 64 * MB, '예산 상수 160/400 MB, 채색 24/64 MB');
  ok(mk().budget === 400 * MB, 'Node(데스크톱) 기본 예산 400 MB');
}

// ── 6. 브라우저 ──
if (!NODE_ONLY) {
  section('브라우저 (헤드리스 Chromium)');
  const { chromium } = await import('playwright-core');
  const MIMES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain' };
  // 가짜 lo/: portraits/lia 만 일부러 없음 (대체 확인), 나머지 bg/cg/portraits 는 원본 파일을 그대로 lo 로 준다
  const LO_MISSING = 'portraits/lia';
  // 가짜 팩: 실제 파일 몇 개
  const PACK_FILES = ['bg/title.webp', 'portraits/kael.webp', 'puppets/kael/kael_hunter/rig.json'].filter((f) => fs.existsSync(path.join(ROOT, 'assets', f)));
  const pIndex = { v: 1, packs: ['0.bnpack'], files: {}, complete: false };
  let pOff = 0; const pBufs = [];
  for (const f of PACK_FILES) { const b = fs.readFileSync(path.join(ROOT, 'assets', f)); pIndex.files[f] = [0, pOff, b.length]; pOff += b.length; pBufs.push(b); }
  const pBlob = Buffer.concat(pBufs);
  const reqs = [];
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    reqs.push(u);
    if (u === '/') u = '/index.html';
    if (u === '/__pack/index.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(pIndex)); return; }
    if (u === '/__pack/0.bnpack') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(pBlob); return; }
    const lo = u.match(/^\/assets\/lo\/(.+)\.webp$/);
    if (lo && lo[1] !== LO_MISSING) u = `/assets/${lo[1]}.webp`;
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIMES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const open = async ({ mobile = false, url = 'index.html', init = null, allow404 = null } = {}) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400 && !(allow404 && allow404.test(r.url()))) errs.push(`HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/Failed to load resource/.test(t)) errs.push(`CONSOLE[${m.type()}] ${t.slice(0, 200)}`); } });
    if (init) await page.addInitScript(init.fn, init.arg);
    reqs.length = 0;
    await page.goto(`http://localhost:${port}/${url}`, { timeout: 30000 });
    await page.waitForFunction(() => !!window.__game?.top, null, { timeout: 30000 });
    return { ctx, page, errs };
  };
  const setLS = { fn: (v) => { if (!sessionStorage.getItem('__t')) { sessionStorage.setItem('__t', '1'); localStorage.setItem('bloodnocturne_settings', v); } } };
  try {
    // 6a. v1 설정 → 'auto' (platform WP-3 acceptance 9)
    {
      const { ctx, page, errs } = await open({ init: { ...setLS, arg: JSON.stringify({ quality: 'medium', musicVol: 0.3, touchOpacity: 0.7 }) } });
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => ({ s: window.__game.settings, ls: JSON.parse(localStorage.getItem('bloodnocturne_settings')) }));
      ok(r.s.quality === 'auto' && r.s.musicVol === 0.3 && r.s.touchOpacity === 0.7 && r.s.settingsVersion === 2, `v1 {quality:'medium'} → 'auto' (${r.s.quality}, v${r.s.settingsVersion})`);
      ok(r.ls.settingsVersion === 2 && r.ls.quality === 'auto', '이관 결과가 localStorage 에 v2 로 저장됨');
      ok(!reqs.some((u) => u.startsWith('/assets/lo/')), '데스크톱(auto → high): lo/ 요청 없음');
      ok(errs.length === 0, `오류 없음 ${errs.slice(0, 3).join(' | ')}`);
      await ctx.close();
    }
    // 6b. v2 설정 유지
    {
      const { ctx, page, errs } = await open({ init: { ...setLS, arg: JSON.stringify({ settingsVersion: 2, quality: 'low', fpsCap: 0, uiScale: 1.3 }) } });
      const s = await page.evaluate(() => window.__game.settings);
      ok(s.quality === 'low' && s.fpsCap === 0 && s.uiScale === 1.3, `v2 설정 유지 (${s.quality}, ${s.fpsCap}, ${s.uiScale})`);
      ok(errs.length === 0, `오류 없음 ${errs.slice(0, 3).join(' | ')}`);
      await ctx.close();
    }
    // 6c. 모바일 + build-info 의 lo 목록 → lo/ 선택, 없는 파일은 원본으로 대체
    {
      const lo = ['bg/title', 'portraits/kael', 'portraits/sera', 'portraits/victor', 'portraits/bran', 'portraits/azel', LO_MISSING];
      const { ctx, page, errs } = await open({ mobile: true, init: { fn: (list) => { window.__BN_BUILD = { lo: list }; }, arg: lo }, allow404: /\/assets\/lo\/portraits\/lia\.webp/ });
      await page.waitForFunction(() => { const a = window.__game.assets; return a.has('bg/title') && a.has('portraits/lia'); }, null, { timeout: 20000 });
      const r = await page.evaluate(() => { const a = window.__game.assets; const e = (k) => a.cache.get(k); return { st: a.stats(), title: e('bg/title').img.src, titleLo: e('bg/title').lo, lia: e('portraits/lia').img.src, liaLo: e('portraits/lia').lo, h: window.__game.canvas.height, q: window.__game.settings.quality }; });
      ok(r.st.lo.want === true, `모바일(백킹 ${r.h}, 등급 ${r.st.env.tier}): lo 선택 (want=${r.st.lo.want})`);
      ok(r.titleLo && /\/assets\/lo\/bg\/title\.webp/.test(r.title), `bg/title 은 lo/ (${r.title.slice(-40)})`);
      ok(!r.liaLo && /\/assets\/portraits\/lia\.webp/.test(r.lia) && r.st.lo.fallbacks >= 1, `lo/ 없는 portraits/lia → 원본으로 대체 (${r.lia.slice(-40)})`);
      ok(reqs.includes('/assets/lo/portraits/lia.webp') && !reqs.includes('/assets/lo/portraits/lia.webp', reqs.indexOf('/assets/lo/portraits/lia.webp') + 1), 'lo/ 실패한 키는 한 번만 시도');
      ok(r.st.budget === 160 * MB && r.st.paintedBudget === 24 * MB, `터치 예산 160/24 MB (${r.st.budget / MB}/${r.st.paintedBudget / MB})`);
      ok(errs.length === 0, `오류 없음 ${errs.slice(0, 3).join(' | ')}`);
      await ctx.close();
    }
    // 6d. 장면 전환 정리 + 내린 이미지 그리기 안전 + 채색 그룹 합산 (스테이지)
    {
      const { ctx, page, errs } = await open();
      await page.waitForFunction(() => window.__game.assets.has('bg/title'), null, { timeout: 20000 });
      const r1 = await page.evaluate(async () => {
        const g = window.__game, a = g.assets;
        a.setBudget({ total: 20 * 1048576 });          // 장면 몫 6 MB → 타이틀 배경(≈10 MB)은 전환 뒤 내려가야 함
        const titleImg = a.cache.get('bg/title').img;
        g.go('hub', {}, { fade: false });
        await new Promise((r) => setTimeout(r, 2600));
        a._poll();                                      // 폴링 한 번 더 (장면 정리 실행)
        await new Promise((r) => setTimeout(r, 300));
        a._poll();
        const c = document.createElement('canvas'); let threw = null;
        try { c.getContext('2d').drawImage(titleImg, 0, 0, 10, 10); } catch (e) { threw = e.message; }
        const pre = ['bg/worldmap', 'bg/shop', 'bg/smith'].filter((k) => !a.cache.has(k));   // hub.enter() 가 미리 받는 배경
        return { hasTitle: a.cache.has('bg/title'), ev: a.stats().evictions, threw, top: g.top?.name, blank: titleImg.src.slice(0, 5), pre };
      });
      ok(r1.top === 'hub' && !r1.hasTitle && r1.ev >= 1, `장면 전환(title→hub) 뒤 쓰이지 않은 bg/title 을 내림 (evictions ${r1.ev}, has ${r1.hasTitle})`);
      ok(r1.pre.length === 0, `새 장면의 enter() 에서 미리 받은 배경은 전환 정리에서 남긴다 (game.go 가 enter 뒤 sceneChange 를 불러도) — 내려간 것: ${r1.pre.join(',')}`);
      ok(r1.threw === null && (r1.blank === 'blob:' || r1.blank === 'data:'), `내린 이미지를 그려도 예외 없음 (${r1.threw}, ${r1.blank})`);
      await page.evaluate(() => { const a = window.__game.assets; a.setBudget({ total: null }); });
      await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s01`);
      await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
      await page.waitForTimeout(3000);
      const r2 = await page.evaluate(() => window.__game.assets.stats());
      ok(r2.groups.puppets > 0 && r2.painted >= r2.groups.puppets, `스테이지: 퍼펫 아틀라스가 채색 예산에 합산 (puppets ${(r2.groups.puppets / 1048576).toFixed(1)} MB, painted ${(r2.painted / 1048576).toFixed(1)} MB)`);
      ok(r2.total > 0 && r2.total <= r2.budget, `스테이지 디코딩 합계 ${(r2.total / 1048576).toFixed(1)} MB ≤ 예산`);
      ok(errs.length === 0, `오류 없음 ${errs.slice(0, 3).join(' | ')}`);
      await ctx.close();
    }
    // 6e. 팩 읽기 (실제 파일로 만든 팩, complete:false → 팩에 없는 것은 일반 경로)
    {
      const { ctx, page, errs } = await open({ init: { fn: () => { window.__BN_BUILD = { pack: '__pack/index.json' }; } } });
      await page.waitForFunction(() => window.__game.assets.has('bg/title'), null, { timeout: 20000 });
      const r = await page.evaluate(async () => {
        const a = window.__game.assets;
        const rig = await a.json('puppets/kael/kael_hunter/rig');
        const e = a.cache.get('bg/title');
        return { src: e.img.src.slice(0, 5), w: e.img.naturalWidth, rig: !!rig?.parts, packs: a.stats().packs, portrait: a.cache.get('portraits/kael')?.img?.src?.slice(0, 5), lia: a.cache.get('portraits/lia')?.img?.src ?? '' };
      });
      ok(r.src === 'blob:' && r.w > 1000, `팩의 bg/title → blob: (${r.src}, ${r.w}px)`);
      ok(r.portrait === 'blob:' && r.rig, '팩의 초상화·리그 json');
      ok(/\/assets\/portraits\/lia\.webp/.test(r.lia), 'complete:false 팩에 없는 파일은 일반 경로');
      ok(!reqs.includes('/assets/bg/title.webp'), '팩에 있는 파일은 일반 경로로 요청하지 않음');
      ok(errs.length === 0, `오류 없음 ${errs.slice(0, 3).join(' | ')}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n${fails ? '✗' : '✓'} test_settings_v2: ${passes} 통과, ${fails} 실패`);
process.exit(fails ? 1 : 0);
