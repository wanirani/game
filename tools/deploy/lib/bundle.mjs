// 의존성 없는 ES 모듈 번들러 (스코프 끌어올리기) — owner: DELIVERY-WEB (MASTER_PLAN §1.20, platform §9.1)
//
// bundleModules({ root, entry, chunkDir, maxLazyChunks }) → { chunks, stats, warnings }
//
// 원리 (Rollup 과 같은 '스코프 끌어올리기'):
//  - 진입 모듈(src/main.js)에서 정적 import 로 닿는 모든 모듈을 ES 평가 순서(깊이 우선 후위)대로 한 파일(main 조각)에 이어 붙인다.
//    모든 모듈의 최상위 선언이 한 스코프에 모이므로 라이브 바인딩·순환 import·함수 선언 끌어올리기·TDZ 가 ES 모듈과 똑같이 동작한다.
//  - 이름이 겹치는 최상위 선언은 이름을 바꾸고(foo → foo$1), import 한 이름은 내보낸 쪽의 (바뀐) 이름으로 바꿔 쓴다.
//    바꾼 이름은 어떤 모듈에도 나오지 않는 새 이름이라 안쪽 스코프의 지역 변수에 가로채이지 않는다.
//    어떤 모듈이 전역으로 쓰는 이름(window, Image …)은 최상위 선언 이름으로 쓰지 않는다.
//  - import * as M 과 동적 import() 결과에는 게터로 된 네임스페이스 객체를 만든다 (라이브 바인딩 유지).
//    M.x (읽기, x 가 실제로 내보낸 이름)는 바로 x 의 최종 이름으로 바꾼다.
//  - import.meta.url 은 원래 모듈 주소(new URL('<조각 기준 상대 경로>', import.meta.url).href)로 바꾼다 (assets.js·ui.js 가 이 값으로 경로를 계산).
//  - 정적으로는 닿지 않고 동적 import() 로만 닿는 모듈(채색 보스 그림 등)은 lazy 조각으로 나눈다. lazy 조각은 main 조각(과 공유 조각)에서
//    쓰는 이름을 import 하고, 자기 네임스페이스 객체를 export 한다. import('../x.js') 는 import('./lazy-N.js').then(m => m.NS) 가 된다.
//    main 밖 모듈은 '소유 집합'(그 모듈에 정적으로 닿는 lazy 묶음들)이 같은 것끼리 한 조각에 모인다: 한 묶음만 쓰면 그 묶음의 조각,
//    여러 묶음이 함께 쓰면 공유 조각. 조각끼리의 정적 import 는 더 큰 소유 집합 쪽으로만 가므로 순환하지 않는다. 조각이 maxLazyChunks 를
//    넘으면 '한 조각 + 그 조각이 import 하는 조각 전부'를 합쳐 줄인다 (순환 없음, 그 조각을 받을 때 어차피 함께 받던 것).
//  - 이름을 바꾼 클래스·함수 선언은 .name 을 원래 이름으로 되돌린다 (hub.js 가 e.constructor.name === 'Door' 로 비교한다).
// 제약: 문자열이 아닌 동적 import, import.meta.url 이 아닌 import.meta, 상대 경로가 아닌 import 는 오류로 멈춘다 (지금 코드에는 없다).
// 최상위 await 는 그대로 둔다 (조각도 모듈이다).
import fs from 'node:fs';
import path from 'node:path';
import { parseModule } from './acorn.mjs';
import { analyzeModule, patternNames } from './scope.mjs';

const HELPER_GLOBALS = ['Object', 'Promise', 'Symbol', 'URL', 'undefined', 'NaN', 'Infinity', 'arguments', 'eval', 'globalThis'];
const posix = (p) => p.split(path.sep).join('/');
const safeIdent = (s) => (s.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^(\d)/, '_$1') || '_');

export function bundleModules({ root, entry, chunkDir = 'src/bundle/x', maxLazyChunks = Infinity, mainName = 'app.js', lazyName = (i) => `lazy-${i}.js` }) {
  const warnings = [];
  const mods = new Map(); // abs → mod

  // ───────── 1. 그래프 읽기 ─────────
  function load(file, from) {
    let m = mods.get(file);
    if (m) return m;
    let code;
    try { code = fs.readFileSync(file, 'utf8'); } catch (e) { throw new Error(`모듈을 찾을 수 없습니다: ${posix(path.relative(root, file))}${from ? ` (import 한 곳: ${from.rel})` : ''}`); }
    const rel = posix(path.relative(root, file));
    const ast = parseModule(code, rel);
    const an = analyzeModule(ast);
    // 최상위 await (core/ui.js 의 await fontsReady): 조각 자체가 모듈이라 그대로 둔다. ES 모듈에서는 이 모듈에 기대지 않는
    // 뒤쪽 모듈이 먼저 평가될 수 있지만 조각에서는 순서대로 기다린다 — 결과 상태는 같고, 진입 모듈(main.js)은 어차피 이 모듈을 기다린다.
    m = { file, rel, code, ast, an, deps: [], imports: new Map(), exportsLocal: new Map(), reexports: new Map(), stars: [], dyn: [], chunk: null, final: new Map(), ns: null, needNs: false, syntheticDefault: null };
    mods.set(file, m);
    const res = (spec) => {
      if (typeof spec !== 'string' || !/^\.{1,2}\//.test(spec)) throw new Error(`${rel}: 상대 경로가 아닌 import '${spec}' 는 지원하지 않습니다`);
      return path.resolve(path.dirname(file), spec);
    };
    for (const st of ast.body) {
      if (st.type === 'ImportDeclaration') {
        const src = res(st.source.value);
        m.deps.push(src);
        for (const s of st.specifiers) {
          const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : (s.imported.name ?? s.imported.value);
          m.imports.set(s.local.name, { source: src, imported });
        }
      } else if (st.type === 'ExportNamedDeclaration') {
        if (st.source) {
          const src = res(st.source.value);
          m.deps.push(src);
          for (const s of st.specifiers) m.reexports.set(s.exported.name ?? s.exported.value, { source: src, imported: s.local.name ?? s.local.value });
        } else if (st.declaration) {
          const d = st.declaration;
          if (d.type === 'VariableDeclaration') for (const dd of d.declarations) for (const n of patternNames(dd.id)) m.exportsLocal.set(n, n);
          else m.exportsLocal.set(d.id.name, d.id.name);
        } else {
          for (const s of st.specifiers) m.exportsLocal.set(s.exported.name ?? s.exported.value, s.local.name);
        }
      } else if (st.type === 'ExportAllDeclaration') {
        const src = res(st.source.value);
        m.deps.push(src);
        if (st.exported) m.reexports.set(st.exported.name ?? st.exported.value, { source: src, imported: '*' });
        else m.stars.push(src);
      } else if (st.type === 'ExportDefaultDeclaration') {
        const d = st.declaration;
        if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) m.exportsLocal.set('default', d.id.name);
        else { m.syntheticDefault = '*default*'; m.exportsLocal.set('default', '*default*'); }
      }
    }
    for (const n of an.dynImports) {
      if (n.source.type !== 'Literal' || typeof n.source.value !== 'string') throw new Error(`${rel}: 문자열이 아닌 동적 import() 는 지원하지 않습니다`);
      m.dyn.push({ node: n, target: res(n.source.value) });
    }
    for (const d of m.deps) load(d, m);
    return m;
  }
  const entryFile = path.resolve(root, entry);
  load(entryFile, null);

  // 정적 닫힘
  const closure = (start, stopSet) => {
    const seen = new Set(); const st = [start];
    while (st.length) { const f = st.pop(); if (seen.has(f) || stopSet?.has(f)) continue; seen.add(f); for (const d of mods.get(f).deps) st.push(d); }
    return seen;
  };
  const mainSet = closure(entryFile);
  // 동적 import 대상 (lazy 조각에서 또 다른 동적 import 가 나오면 계속 따라간다)
  const lazyEntries = [];
  {
    const q = [...mods.values()];
    const seenT = new Set();
    while (q.length) {
      const m = q.shift();
      for (const d of m.dyn) {
        if (!mods.has(d.target)) { load(d.target, m); for (const f of closure(d.target)) if (!q.includes(mods.get(f))) q.push(mods.get(f)); }
        if (!mainSet.has(d.target) && !seenT.has(d.target)) { seenT.add(d.target); lazyEntries.push({ target: d.target, importer: m.file }); }
      }
    }
  }
  // ───────── 2. 조각 나누기 ─────────
  let groups = lazyEntries.map((e) => ({ entries: [e.target], importer: e.importer }));
  if (groups.length > maxLazyChunks) {
    // 같은 파일이 import() 하는 것끼리 먼저 묶고, 그래도 많으면 작은 것부터 합친다
    const byImp = new Map();
    for (const g of groups) { const k = g.importer; if (!byImp.has(k)) byImp.set(k, { entries: [], importer: k }); byImp.get(k).entries.push(...g.entries); }
    groups = [...byImp.values()];
    const sizeOf = (g) => g.entries.reduce((s, t) => s + [...closure(t, mainSet)].reduce((a, f) => a + mods.get(f).code.length, 0), 0);
    while (groups.length > maxLazyChunks) {
      groups.sort((a, b) => sizeOf(a) - sizeOf(b));
      const [a, b] = groups.splice(0, 2);
      groups.push({ entries: [...a.entries, ...b.entries], importer: a.importer });
    }
    groups.sort((a, b) => a.entries[0].localeCompare(b.entries[0]));
  }

  // 평가 순서 (ES: import 문 순서대로 깊이 우선, 후위)
  const order = (starts, skip) => {
    const out = []; const state = new Map();
    const visit = (f) => {
      if (skip.has(f) || state.has(f)) return;
      state.set(f, 1);
      for (const d of mods.get(f).deps) visit(d);
      out.push(f);
    };
    for (const s of starts) visit(s);
    return out;
  };
  const mainOrder = order([entryFile], new Set());
  const mainAll = new Set(mainOrder);
  // 소유 집합: main 밖 모듈마다 그 모듈에 정적으로 닿는 lazy 묶음(group)들. 한 묶음만 닿으면 그 묶음의 조각,
  // 여러 묶음이 닿으면(공유 모듈, 다른 묶음 안에서 정적으로도 쓰이는 lazy 진입점 포함) 같은 소유 집합끼리 모은 공유 조각에 넣는다.
  // 공유 조각의 모듈이 import 하는 모듈은 소유 집합이 같거나 더 크므로 조각끼리의 import 는 순환하지 않는다 (큰 집합 쪽으로만).
  const ownerOf = new Map();
  groups.forEach((g, gi) => { for (const t of g.entries) for (const f of closure(t, mainAll)) (ownerOf.get(f) || ownerOf.set(f, new Set()).get(f)).add(gi); });
  const globalOrder = order([entryFile, ...lazyEntries.map((e) => e.target)], new Set());
  const byKey = new Map();
  for (const f of globalOrder) {
    if (mainAll.has(f)) continue;
    const os = ownerOf.get(f);
    if (!os) continue;
    const key = [...os].sort((x, y) => x - y).join(',');
    if (!byKey.has(key)) byKey.set(key, { key, size: os.size, first: Math.min(...os), files: [] });
    byKey.get(key).files.push(f);
  }
  let lazyChunks = [...byKey.values()].sort((x, y) => x.size - y.size || x.first - y.first || (x.key < y.key ? -1 : 1));
  // 조각 수 상한 (maxLazyChunks = lazy + 공유 조각 수, 아티팩트는 main 포함 ≤ 8): 공유 조각 때문에 넘으면 합친다.
  // 합치기는 조각 사이 정적 import 그래프에 순환을 만들지 않는다 (ES 평가 순서 유지):
  //  (1) 조각 X 와 X 가 (간접으로라도) 정적으로 import 하는 조각 전부 → 한 조각. X 를 받을 때 어차피 함께 받던 것이라 X 쪽 비용이 없고,
  //      합친 묶음에서 밖으로 나가는 import 가 없으므로 순환이 생길 수 없다. 가장 많은 조각을 줄이는 X 부터 (같으면 코드가 큰 X).
  //  (2) 어느 조각도 다른 조각을 import 하지 않으면 가장 작은 둘을 합친다 (둘 다 나가는 import 가 없어 순환이 없다).
  // 합친 조각 안의 모듈은 전역 평가 순서(globalOrder)대로 둔다 — 같은 조각 안의 의존 모듈이 늘 먼저 온다.
  if (lazyChunks.length > Math.max(1, maxLazyChunks)) {
    const pos = new Map(globalOrder.map((f, i) => [f, i]));
    const bytesOf = (p) => p.files.reduce((s, f) => s + mods.get(f).code.length, 0);
    while (lazyChunks.length > Math.max(1, maxLazyChunks)) {
      const partOf = new Map();
      for (const p of lazyChunks) for (const f of p.files) partOf.set(f, p);
      const deps = new Map(lazyChunks.map((p) => [p, new Set()]));
      for (const p of lazyChunks) for (const f of p.files) for (const d of mods.get(f).deps) { const q = partOf.get(d); if (q && q !== p) deps.get(p).add(q); }
      const reach = (p) => { const seen = new Set(); const st = [...deps.get(p)]; while (st.length) { const q = st.pop(); if (seen.has(q)) continue; seen.add(q); st.push(...deps.get(q)); } return seen; };
      let best = null;
      for (const p of lazyChunks) {
        const r = reach(p);
        if (!r.size) continue;
        const b = bytesOf(p);
        if (!best || r.size > best.r.size || (r.size === best.r.size && b > best.bytes)) best = { p, r, bytes: b };
      }
      const merge = best ? [best.p, ...best.r] : [...lazyChunks].sort((x, y) => bytesOf(x) - bytesOf(y)).slice(0, 2);
      const files = merge.flatMap((p) => p.files).sort((x, y) => pos.get(x) - pos.get(y));
      const merged = { key: merge.map((p) => p.key).join('|'), size: Math.max(...merge.map((p) => p.size)), first: Math.min(...merge.map((p) => p.first)), files, merged: true };
      lazyChunks = lazyChunks.filter((p) => !merge.includes(p));
      lazyChunks.splice(0, 0, merged);
      lazyChunks.sort((x, y) => x.first - y.first || x.size - y.size || (x.key < y.key ? -1 : 1));
    }
  }
  const chunks = [{ name: mainName, kind: 'main', files: mainOrder, imports: new Map(), exports: new Set(), entries: [] }];
  lazyChunks.forEach((lc, i) => {
    const entries = lazyEntries.map((e) => e.target).filter((t) => lc.files.includes(t));
    // lazy = 동적 import() 로 부르는 진입 모듈이 있는 조각, shared = 여러 lazy 조각이 함께 쓰는 모듈만 있는 조각
    chunks.push({ name: lazyName(i + 1), kind: entries.length ? 'lazy' : 'shared', files: lc.files, imports: new Map(), exports: new Set(), entries });
  });
  for (const c of chunks) for (const f of c.files) {
    const m = mods.get(f);
    if (m.chunk) throw new Error(`${m.rel}: 두 조각에 들어갔습니다 (번들러 오류)`);
    m.chunk = c;
  }
  const used = [...mods.values()].filter((m) => m.chunk);
  for (const m of mods.values()) if (!m.chunk) warnings.push(`${m.rel}: 어느 조각에도 들어가지 않았습니다`);

  // ───────── 3. 이름 정하기 ─────────
  const reserved = new Set(HELPER_GLOBALS);
  const allNames = new Set();
  for (const m of used) { for (const n of m.an.free.keys()) reserved.add(n); for (const n of m.an.allNames) allNames.add(n); }
  const taken = new Set();
  function fresh(base) {
    let i = 1, n;
    do { n = `${base}$${i++}`; } while (taken.has(n) || reserved.has(n) || allNames.has(n));
    taken.add(n);
    return n;
  }
  function claim(name) {
    if (!taken.has(name) && !reserved.has(name)) { taken.add(name); return name; }
    return fresh(name);
  }
  const allocOrder = chunks.flatMap((c) => c.files.map((f) => mods.get(f)));
  for (const m of allocOrder) {
    for (const [name, b] of m.an.top) if (b.kind !== 'import') m.final.set(name, claim(name));
    if (m.syntheticDefault) m.final.set('*default*', fresh(safeIdent(path.basename(m.file, '.js')) + '_default'));
  }
  const nsName = (m) => { if (!m.ns) m.ns = fresh('ns_' + safeIdent(path.basename(m.file, '.js'))); m.needNs = true; return m.ns; };

  function resolveExport(m, name, seen = new Set()) {
    const key = m.file + '\0' + name;
    if (seen.has(key)) return null;
    seen.add(key);
    if (m.exportsLocal.has(name)) {
      const local = m.exportsLocal.get(name);
      if (local !== '*default*' && m.an.top.get(local)?.kind === 'import') return targetOfImport(m, local, seen);
      return { kind: 'binding', mod: m, local };
    }
    if (m.reexports.has(name)) {
      const r = m.reexports.get(name);
      const src = mods.get(r.source);
      return r.imported === '*' ? { kind: 'ns', mod: src } : resolveExport(src, r.imported, seen);
    }
    if (name === 'default') return null;
    let found = null;
    for (const s of m.stars) {
      const t = resolveExport(mods.get(s), name, new Set(seen));
      if (!t) continue;
      if (found && !(found.kind === t.kind && found.mod === t.mod && found.local === t.local)) return null; // 모호함
      found = t;
    }
    return found;
  }
  function targetOfImport(m, local, seen) {
    const imp = m.imports.get(local);
    const src = mods.get(imp.source);
    if (imp.imported === '*') return { kind: 'ns', mod: src };
    const t = resolveExport(src, imp.imported, seen);
    if (!t) throw new Error(`${m.rel}: '${imp.imported}' 은(는) ${src.rel} 에서 내보내지 않습니다 (브라우저에서도 SyntaxError 로 게임이 멈춘다)`);
    return t;
  }
  function targetOf(m, local) {
    const b = m.an.top.get(local);
    if (b && b.kind !== 'import') return { kind: 'binding', mod: m, local };
    return targetOfImport(m, local, new Set());
  }
  const exportNamesCache = new Map();
  function exportNames(m, seen = new Set()) {
    if (exportNamesCache.has(m)) return exportNamesCache.get(m);
    if (seen.has(m)) return new Set();
    seen.add(m);
    const s = new Set([...m.exportsLocal.keys(), ...m.reexports.keys()]);
    for (const st of m.stars) for (const n of exportNames(mods.get(st), seen)) if (n !== 'default') s.add(n);
    exportNamesCache.set(m, s);
    return s;
  }
  const textOf = (t) => (t.kind === 'ns' ? nsName(t.mod) : t.mod.final.get(t.local));

  // 이름 충돌 (바꿔 쓴 이름이 그 모듈 안쪽 지역 이름과 같으면 가로채일 수 있다) → 새 이름으로
  for (let iter = 0; iter < 6; iter++) {
    let changed = false;
    for (const m of used) {
      for (const r of m.an.topRefs) {
        if (r.exportSpec) continue;
        const t = targetOf(m, r.name);
        let texts = [textOf(t)];
        if (t.kind === 'ns' && r.member && !r.member.computed) {
          const t2 = resolveExport(t.mod, r.member.property.name);
          if (t2) texts = [textOf(t2)];
        }
        for (const txt of texts) {
          if (txt !== r.name && m.an.innerNames.has(txt)) {
            // 가로채일 수 있는 대상의 최종 이름을 새 이름으로
            const tt = t.kind === 'ns' && r.member && resolveExport(t.mod, r.member.property.name) ? resolveExport(t.mod, r.member.property.name) : t;
            if (tt.kind === 'ns') tt.mod.ns = fresh('ns_' + safeIdent(path.basename(tt.mod.file, '.js')));
            else tt.mod.final.set(tt.local, fresh(tt.local === '*default*' ? 'default' : tt.local));
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
    if (iter === 5) throw new Error('이름 충돌을 풀지 못했습니다 (번들러 오류)');
  }

  // ───────── 4. 코드 만들기 ─────────
  const chunkOf = (m) => m.chunk;
  function useFrom(c, t) {
    // 다른 조각의 이름이면 import/export 로 잇는다
    const owner = t.mod.chunk;
    const txt = textOf(t);
    if (owner !== c) { (c.imports.get(owner) || c.imports.set(owner, new Set()).get(owner)).add(txt); owner.exports.add(txt); }
    return txt;
  }
  const hoistFixes = new Map(); // chunk → [code]
  function genModule(m) {
    const c = m.chunk;
    const code = m.code;
    const edits = [];
    const add = (s, e, t) => edits.push([s, e, t]);
    for (const st of m.ast.body) {
      switch (st.type) {
        case 'ImportDeclaration': add(st.start, st.end, ''); break;
        case 'ExportAllDeclaration': add(st.start, st.end, ''); break;
        case 'ExportNamedDeclaration':
          if (st.declaration) add(st.start, st.declaration.start, '');
          else add(st.start, st.end, '');
          break;
        case 'ExportDefaultDeclaration': {
          const d = st.declaration;
          if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) { add(st.start, d.start, ''); break; }
          const name = m.final.get('*default*');
          if (d.type === 'FunctionDeclaration') {
            add(st.start, d.start, '');
            const head = code.slice(d.start, d.params.length ? d.params[0].start : d.body.start);
            const mm = /^(async\s+)?function\s*(\*\s*)?/.exec(head);
            if (!mm) throw new Error(`${m.rel}: export default function 머리를 읽지 못했습니다`);
            add(d.start + mm[0].length, d.start + mm[0].length, ` ${name}`);
            (hoistFixes.get(c) || hoistFixes.set(c, []).get(c)).push(`Object.defineProperty(${name},"name",{value:"default",configurable:true});`);
          } else if (d.type === 'ClassDeclaration') {
            add(st.start, d.start, `const ${name} = `);
            add(d.end, d.end, `;Object.defineProperty(${name},"name",{value:"default",configurable:true});`);
          } else {
            add(st.start, d.start, `const ${name} = `);
            if (code[st.end - 1] !== ';') add(st.end, st.end, ';');
          }
          break;
        }
        default: break;
      }
    }
    for (const r of m.an.topRefs) {
      if (r.exportSpec) continue;
      const t = targetOf(m, r.name);
      if (t.kind === 'ns' && r.member && !r.member.computed) {
        const t2 = resolveExport(t.mod, r.member.property.name);
        if (t2) { add(r.member.start, r.member.end, useFrom(c, t2)); continue; }
      }
      const txt = useFrom(c, t);
      if (txt !== r.node.name) add(r.node.start, r.node.end, r.shorthand ? `${r.node.name}: ${txt}` : txt);
      // 이름이 바뀐 선언: .name 되돌리기
      if (r.decl && t.kind === 'binding' && t.mod === m && txt !== r.name) {
        const b = m.an.top.get(r.name);
        if (b.kind === 'function' && b.decl.type === 'FunctionDeclaration') (hoistFixes.get(c) || hoistFixes.set(c, []).get(c)).push(`Object.defineProperty(${txt},"name",{value:${JSON.stringify(r.name)},configurable:true});`);
        else if (b.kind === 'class' && b.decl.type === 'ClassDeclaration' && !b.decl.body.body.some((e) => e.static && !e.computed && (e.key.name ?? e.key.value) === 'name')) add(b.decl.end, b.decl.end, `;Object.defineProperty(${txt},"name",{value:${JSON.stringify(r.name)},configurable:true});`);
      }
    }
    for (const { node, parent } of m.an.metas) {
      if (parent?.type === 'MemberExpression' && parent.object === node && !parent.computed && parent.property.name === 'url') {
        const rel = posix(path.relative(chunkDir, m.rel));
        add(parent.start, parent.end, `new URL(${JSON.stringify(rel.startsWith('.') ? rel : './' + rel)}, import.meta.url).href`);
      } else throw new Error(`${m.rel}: import.meta.url 이 아닌 import.meta 사용은 지원하지 않습니다`);
    }
    for (const { node, target } of m.dyn) {
      const tm = mods.get(target);
      const ns = nsName(tm);
      let txt;
      if (tm.chunk === c) txt = `Promise.resolve(${ns})`;
      else if (tm.chunk.kind !== 'main') { txt = `import(${JSON.stringify('./' + tm.chunk.name)}).then((__m) => __m.${ns})`; tm.chunk.exports.add(ns); }
      else { useFrom(c, { kind: 'ns', mod: tm }); txt = `Promise.resolve(${ns})`; }
      add(node.start, node.end, txt);
    }
    // 적용 (뒤에서부터, 겹치면 오류)
    edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let out = code, last = Infinity;
    for (const [s, e, t] of edits) {
      if (e > last) throw new Error(`${m.rel}: 겹치는 편집 ${s}-${e} (번들러 오류)`);
      out = out.slice(0, s) + t + out.slice(e);
      last = s;
    }
    return out;
  }

  const bodies = new Map();
  // lazy 조각 먼저 (main 이 export 할 이름을 모은다), 그다음 main
  for (const c of [...chunks.slice(1), chunks[0]]) bodies.set(c, c.files.map((f) => ({ rel: mods.get(f).rel, code: genModule(mods.get(f)) })));
  // 네임스페이스 객체 (게터 = 라이브 바인딩)
  function nsDecl(m) {
    const c = m.chunk;
    const props = [...exportNames(m)].sort().map((n) => {
      const t = resolveExport(m, n);
      if (!t) return null;
      return `get ${JSON.stringify(n)}() { return ${useFrom(c, t)}; }`;
    }).filter(Boolean);
    return `const ${m.ns} = Object.freeze({ __proto__: null, [Symbol.toStringTag]: "Module", ${props.join(', ')} });`;
  }
  // 네임스페이스가 필요한 모듈 (nsDecl 이 또 다른 네임스페이스를 부를 수 있어 고정점까지)
  const nsDone = new Set();
  const nsCode = new Map(chunks.map((c) => [c, []]));
  for (;;) {
    const todo = used.filter((m) => m.needNs && !nsDone.has(m));
    if (!todo.length) break;
    for (const m of todo) { nsDone.add(m); nsCode.get(m.chunk).push(nsDecl(m)); }
  }

  const out = [];
  for (const c of chunks) {
    const parts = [];
    parts.push(`/* BLOOD NOCTURNE — tools/deploy 번들 (${c.kind} 조각, 모듈 ${c.files.length}개). 원본: src/ */`);
    for (const [src, names] of c.imports) parts.push(`import { ${[...names].sort().join(', ')} } from ${JSON.stringify('./' + src.name)};`);
    parts.push(...(hoistFixes.get(c) || []));
    parts.push(...nsCode.get(c));
    for (const b of bodies.get(c)) parts.push(`/* ── ${b.rel} ── */\n${b.code}\n;`);
    if (c.exports.size) parts.push(`export { ${[...c.exports].sort().join(', ')} };`);
    out.push({ name: c.name, kind: c.kind, code: parts.join('\n'), modules: c.files.map((f) => mods.get(f).rel), entries: c.entries.map((f) => mods.get(f).rel) });
  }
  // lazy 가 main 을 import 하는데 main 이 다른 lazy 를 import 하는 일은 없다 (main 은 import 하지 않는다)
  if (chunks[0].imports.size) throw new Error('main 조각이 다른 조각을 정적으로 import 합니다 (번들러 오류)');
  // 조각 사이 정적 import 에 순환이 없어야 한다 (평가 순서가 원본 ES 모듈과 같게) — 소유 집합·합치기 규칙이 보장하지만 한 번 더 확인한다
  {
    const state = new Map();
    const visit = (c, path) => {
      if (state.get(c) === 2) return;
      if (state.get(c) === 1) throw new Error(`조각 import 순환: ${[...path, c].map((x) => x.name).join(' → ')} (번들러 오류)`);
      state.set(c, 1);
      for (const d of c.imports.keys()) visit(d, [...path, c]);
      state.set(c, 2);
    };
    for (const c of chunks) visit(c, []);
  }

  const allowedFree = new Set(HELPER_GLOBALS);
  for (const m of used) for (const n of m.an.free.keys()) allowedFree.add(n);
  return {
    chunks: out,
    allowedFree,
    warnings,
    stats: { modules: used.length, lazyEntries: lazyEntries.length, sourceBytes: used.reduce((s, m) => s + Buffer.byteLength(m.code), 0), unreachable: [] },
    moduleFiles: used.map((m) => m.rel),
  };
}

/** 번들 결과 점검: 구문, 조각마다 자유 이름이 원래 전역 이름뿐인지 */
export function verifyChunks(chunks, allowedFree) {
  const problems = [];
  for (const c of chunks) {
    let ast;
    try { ast = parseModule(c.code, c.name); } catch (e) { problems.push(`${c.name}: ${e.message}`); continue; }
    const an = analyzeModule(ast);
    for (const n of an.free.keys()) if (!allowedFree.has(n)) problems.push(`${c.name}: 원본에 없던 자유 이름 '${n}' (이름 바꾸기 누락)`);
  }
  return problems;
}
