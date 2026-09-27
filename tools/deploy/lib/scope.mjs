// ES 모듈 스코프 분석 (acorn ESTree) — owner: DELIVERY-WEB
//
// analyzeModule(ast) → {
//   top: Map(name → { kind: 'var'|'let'|'const'|'function'|'class'|'import', ids: [Identifier], decl }),
//   topRefs: [{ node, name, shorthand, member, write }],   // 모듈 최상위 바인딩을 가리키는 식별자 (선언 자리 포함)
//   free: Map(name → count),                                // 어디에도 선언되지 않은 이름 (전역)
//   innerNames: Set,                                        // 함수·블록 등 안쪽 스코프에서 선언된 이름
//   allNames: Set,                                          // 이 모듈에 나오는 모든 식별자 이름
//   metas: [{ node, parent }],                              // import.meta
//   dynImports: [ImportExpression],
//   tla: boolean,                                           // 최상위 await
// }
// member = 이 식별자가 `X.y` (계산되지 않은 속성 읽기) 의 X 일 때 그 MemberExpression (쓰기 대상이 아닐 때만)
// shorthand = 객체 리터럴/패턴의 단축 속성 { a } 의 a (이름을 바꾸면 { a: 새이름 } 으로 써야 한다)
//
// 모듈 코드(항상 strict)만 다룬다. with 문·직접 eval 은 없다고 가정한다 (있으면 오류).

class Scope {
  constructor(parent, kind) {
    this.parent = parent;
    this.kind = kind; // module | function | block | catch | class | fname | static
    this.names = new Map();
  }
  get isVarScope() { return this.kind === 'module' || this.kind === 'function' || this.kind === 'static'; }
  varScope() { let s = this; while (!s.isVarScope) s = s.parent; return s; }
}

export function analyzeModule(ast) {
  const moduleScope = new Scope(null, 'module');
  const pending = []; // { node, scope, shorthand, member, write }
  const innerNames = new Set();
  const allNames = new Set();
  const metas = [];
  const dynImports = [];
  let fnDepth = 0;
  let tla = false;

  function declare(scope, name, kind, id, decl) {
    allNames.add(name);
    if (scope !== moduleScope) innerNames.add(name);
    let b = scope.names.get(name);
    if (!b) { b = { kind, ids: [], decl }; scope.names.set(name, b); }
    if (id) b.ids.push(id);
    return b;
  }
  function ref(node, scope, extra) {
    allNames.add(node.name);
    pending.push({ node, scope, ...extra });
  }

  // ── 패턴: 선언 (let/const/var/매개변수/catch) ──
  function declarePattern(p, scope, kind, decl, sh = false) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier':
        declare(scope, p.name, kind, p, decl);
        // 선언 자리도 이름 바꾸기 대상이므로 참조처럼 기록 (해결하면 같은 스코프)
        pending.push({ node: p, scope, shorthand: sh, decl: true });
        allNames.add(p.name);
        return;
      case 'ObjectPattern':
        for (const pr of p.properties) {
          if (pr.type === 'RestElement') { declarePattern(pr.argument, scope, kind, decl); continue; }
          if (pr.computed) expr(pr.key, patternExprScope);
          declarePattern(pr.value, scope, kind, decl, pr.shorthand);
        }
        return;
      case 'ArrayPattern':
        for (const el of p.elements) if (el) declarePattern(el, scope, kind, decl);
        return;
      case 'RestElement':
        declarePattern(p.argument, scope, kind, decl);
        return;
      case 'AssignmentPattern':
        declarePattern(p.left, scope, kind, decl, sh);
        expr(p.right, patternExprScope);
        return;
      default:
        throw new Error('알 수 없는 선언 패턴 ' + p.type);
    }
  }
  // 패턴 안의 기본값·계산 키가 평가되는 스코프 (declarePattern 호출 전에 설정)
  let patternExprScope = moduleScope;
  function declarePatternIn(p, targetScope, kind, decl, exprScope) {
    const prev = patternExprScope;
    patternExprScope = exprScope;
    declarePattern(p, targetScope, kind, decl);
    patternExprScope = prev;
  }

  // ── 패턴: 대입 대상 (a = …, [a, b] = …, for (a of …)) ──
  function assignTarget(p, scope, sh = false) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier': ref(p, scope, { shorthand: sh, write: true }); return;
      case 'MemberExpression': member(p, scope, true); return;
      case 'ObjectPattern':
        for (const pr of p.properties) {
          if (pr.type === 'RestElement') { assignTarget(pr.argument, scope); continue; }
          if (pr.computed) expr(pr.key, scope);
          assignTarget(pr.value, scope, pr.shorthand);
        }
        return;
      case 'ArrayPattern': for (const el of p.elements) if (el) assignTarget(el, scope); return;
      case 'RestElement': assignTarget(p.argument, scope); return;
      case 'AssignmentPattern': assignTarget(p.left, scope, sh); expr(p.right, scope); return;
      case 'ParenthesizedExpression': assignTarget(p.expression, scope); return;
      case 'ChainExpression': expr(p, scope); return;
      default: throw new Error('알 수 없는 대입 대상 ' + p.type);
    }
  }

  function member(m, scope, write) {
    if (m.object.type === 'Identifier' && !m.computed && !write && !m.optional) {
      ref(m.object, scope, { member: m });
    } else if (m.object.type === 'Super') { /* super.x */ } else expr(m.object, scope);
    if (m.computed) expr(m.property, scope);
  }

  // ── 함수 ──
  function fn(node, scope) {
    let outer = scope;
    if (node.type === 'FunctionExpression' && node.id) {
      outer = new Scope(scope, 'fname');
      declare(outer, node.id.name, 'fname', node.id, node);
    }
    const fs = new Scope(outer, 'function');
    if (node.type !== 'ArrowFunctionExpression') declare(fs, 'arguments', 'arguments', null, node);
    for (const p of node.params) declarePatternIn(p, fs, 'param', node, fs);
    fnDepth++;
    if (node.body.type === 'BlockStatement') {
      for (const st of node.body.body) stmt(st, fs);
    } else expr(node.body, fs);
    fnDepth--;
  }

  // 선언 끌어올리기: 참조는 모든 선언을 등록한 뒤 맨 끝에 한꺼번에 해결하므로 따로 할 일이 없다.

  function cls(node, scope, isDecl) {
    // 클래스 선언의 이름은 바깥 스코프에 선언 (본문 안 참조도 같은 바인딩으로 본다: 이름을 바꾸면 함께 바뀐다)
    let inner = scope;
    if (!isDecl && node.id) {
      inner = new Scope(scope, 'class');
      declare(inner, node.id.name, 'class', node.id, node);
    }
    if (node.superClass) expr(node.superClass, inner);
    for (const el of node.body.body) {
      switch (el.type) {
        case 'MethodDefinition':
          if (el.computed) expr(el.key, inner);
          fn(el.value, inner);
          break;
        case 'PropertyDefinition':
          if (el.computed) expr(el.key, inner);
          if (el.value) { fnDepth++; const fs = new Scope(inner, 'function'); expr(el.value, fs); fnDepth--; }
          break;
        case 'StaticBlock': {
          const ss = new Scope(inner, 'static');
          fnDepth++;
          for (const st of el.body) stmt(st, ss);
          fnDepth--;
          break;
        }
        default: throw new Error('알 수 없는 클래스 요소 ' + el.type);
      }
    }
  }

  function varDecl(node, scope) {
    const target = node.kind === 'var' ? scope.varScope() : scope;
    for (const d of node.declarations) {
      declarePatternIn(d.id, target, node.kind, node, scope);
      if (d.init) expr(d.init, scope);
    }
  }

  function block(body, scope) {
    const bs = new Scope(scope, 'block');
    for (const st of body) stmt(st, bs);
  }

  function stmt(n, scope) {
    if (!n) return;
    switch (n.type) {
      case 'ExpressionStatement': expr(n.expression, scope); return;
      case 'BlockStatement': block(n.body, scope); return;
      case 'EmptyStatement': case 'DebuggerStatement': return;
      case 'WithStatement': throw new Error('with 문은 지원하지 않습니다');
      case 'ReturnStatement': if (n.argument) expr(n.argument, scope); return;
      case 'LabeledStatement': stmt(n.body, scope); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'IfStatement': expr(n.test, scope); stmt(n.consequent, scope); if (n.alternate) stmt(n.alternate, scope); return;
      case 'SwitchStatement': {
        expr(n.discriminant, scope);
        const bs = new Scope(scope, 'block');
        for (const c of n.cases) { if (c.test) expr(c.test, bs); for (const st of c.consequent) stmt(st, bs); }
        return;
      }
      case 'ThrowStatement': expr(n.argument, scope); return;
      case 'TryStatement':
        stmt(n.block, scope);
        if (n.handler) {
          const cs = new Scope(scope, 'catch');
          if (n.handler.param) declarePatternIn(n.handler.param, cs, 'let', n.handler, cs);
          block(n.handler.body.body, cs);
        }
        if (n.finalizer) stmt(n.finalizer, scope);
        return;
      case 'WhileStatement': expr(n.test, scope); stmt(n.body, scope); return;
      case 'DoWhileStatement': stmt(n.body, scope); expr(n.test, scope); return;
      case 'ForStatement': {
        const fs = new Scope(scope, 'block');
        if (n.init) { if (n.init.type === 'VariableDeclaration') varDecl(n.init, fs); else expr(n.init, fs); }
        if (n.test) expr(n.test, fs);
        if (n.update) expr(n.update, fs);
        stmt(n.body, fs);
        return;
      }
      case 'ForInStatement': case 'ForOfStatement': {
        if (n.type === 'ForOfStatement' && n.await && fnDepth === 0) tla = true;
        const fs = new Scope(scope, 'block');
        if (n.left.type === 'VariableDeclaration') varDecl(n.left, fs); else assignTarget(n.left, fs);
        expr(n.right, fs);
        stmt(n.body, fs);
        return;
      }
      case 'FunctionDeclaration': {
        // strict 모드: 블록 안 함수 선언은 그 블록 스코프
        declare(scope, n.id.name, 'function', n.id, n);
        pending.push({ node: n.id, scope, decl: true });
        fn(n, scope);
        return;
      }
      case 'VariableDeclaration': varDecl(n, scope); return;
      case 'ClassDeclaration':
        declare(scope, n.id.name, 'class', n.id, n);
        pending.push({ node: n.id, scope, decl: true });
        cls(n, scope, true);
        return;
      case 'ImportDeclaration':
        for (const s of n.specifiers) {
          declare(moduleScope, s.local.name, 'import', s.local, n);
          allNames.add(s.local.name);
        }
        return;
      case 'ExportNamedDeclaration':
        if (n.declaration) stmt(n.declaration, scope);
        else if (!n.source) for (const s of n.specifiers) { if (s.local.type === 'Identifier') ref(s.local, scope, { exportSpec: true }); }
        return;
      case 'ExportDefaultDeclaration': {
        const d = n.declaration;
        if (d.type === 'FunctionDeclaration') {
          if (d.id) { declare(scope, d.id.name, 'function', d.id, d); pending.push({ node: d.id, scope, decl: true }); }
          fn(d, scope);
        } else if (d.type === 'ClassDeclaration') {
          if (d.id) { declare(scope, d.id.name, 'class', d.id, d); pending.push({ node: d.id, scope, decl: true }); }
          cls(d, scope, true);
        } else expr(d, scope);
        return;
      }
      case 'ExportAllDeclaration': return;
      default: throw new Error('알 수 없는 문장 ' + n.type);
    }
  }

  function expr(n, scope) {
    if (!n) return;
    switch (n.type) {
      case 'Identifier': ref(n, scope, {}); return;
      case 'Literal': case 'ThisExpression': case 'Super': case 'PrivateIdentifier': case 'TemplateElement': return;
      case 'ArrayExpression': for (const e of n.elements) if (e) expr(e, scope); return;
      case 'ObjectExpression':
        for (const p of n.properties) {
          if (p.type === 'SpreadElement') { expr(p.argument, scope); continue; }
          if (p.computed) expr(p.key, scope);
          if (p.shorthand && p.value.type === 'Identifier') ref(p.value, scope, { shorthand: true });
          else if (p.kind === 'get' || p.kind === 'set' || p.method) fn(p.value, scope);
          else expr(p.value, scope);
        }
        return;
      case 'SpreadElement': expr(n.argument, scope); return;
      case 'FunctionExpression': case 'ArrowFunctionExpression': fn(n, scope); return;
      case 'ClassExpression': cls(n, scope, false); return;
      case 'UnaryExpression':
        if (n.operator === 'delete' && n.argument.type === 'MemberExpression') member(n.argument, scope, true);
        else expr(n.argument, scope);
        return;
      case 'UpdateExpression': assignTarget(n.argument, scope); return;
      case 'BinaryExpression': case 'LogicalExpression':
        if (n.left.type === 'PrivateIdentifier') { /* #x in obj */ } else expr(n.left, scope);
        expr(n.right, scope);
        return;
      case 'AssignmentExpression': assignTarget(n.left, scope); expr(n.right, scope); return;
      case 'MemberExpression': member(n, scope, false); return;
      case 'ChainExpression': expr(n.expression, scope); return;
      case 'ConditionalExpression': expr(n.test, scope); expr(n.consequent, scope); expr(n.alternate, scope); return;
      case 'CallExpression': case 'NewExpression':
        expr(n.callee, scope);
        for (const a of n.arguments) expr(a, scope);
        return;
      case 'SequenceExpression': for (const e of n.expressions) expr(e, scope); return;
      case 'YieldExpression': if (n.argument) expr(n.argument, scope); return;
      case 'AwaitExpression': if (fnDepth === 0) tla = true; expr(n.argument, scope); return;
      case 'TemplateLiteral': for (const e of n.expressions) expr(e, scope); return;
      case 'TaggedTemplateExpression': expr(n.tag, scope); expr(n.quasi, scope); return;
      case 'MetaProperty':
        if (n.meta.name === 'import') metas.push({ node: n });
        return;
      case 'ImportExpression': dynImports.push(n); expr(n.source, scope); if (n.options) expr(n.options, scope); return;
      case 'ParenthesizedExpression': expr(n.expression, scope); return;
      default: throw new Error('알 수 없는 식 ' + n.type);
    }
  }

  for (const st of ast.body) stmt(st, moduleScope);

  // import.meta 의 부모 (import.meta.url 인지) 찾기
  if (metas.length) {
    const want = new Set(metas.map((m) => m.node));
    const byNode = new Map(metas.map((m) => [m.node, m]));
    (function walk(n, parent) {
      if (!n || typeof n.type !== 'string') return;
      if (want.has(n)) byNode.get(n).parent = parent;
      for (const k in n) {
        if (k === 'type' || k === 'start' || k === 'end') continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, n); } else if (v && typeof v.type === 'string') walk(v, n);
      }
    })(ast, null);
  }

  // ── 참조 해결 ──
  const topRefs = [];
  const free = new Map();
  for (const r of pending) {
    const name = r.node.name;
    let s = r.scope, found = null;
    while (s) { if (s.names.has(name)) { found = s; break; } s = s.parent; }
    if (!found) { free.set(name, (free.get(name) || 0) + 1); continue; }
    if (found === moduleScope) topRefs.push({ node: r.node, name, shorthand: !!r.shorthand, member: r.member || null, write: !!r.write, decl: !!r.decl, exportSpec: !!r.exportSpec });
  }
  return { top: moduleScope.names, topRefs, free, innerNames, allNames, metas, dynImports, tla };
}

/** 선언 패턴에서 이름들 (export const {a, b} = … 용) */
export function patternNames(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': for (const pr of p.properties) patternNames(pr.type === 'RestElement' ? pr.argument : pr.value, out); break;
    case 'ArrayPattern': for (const el of p.elements) patternNames(el, out); break;
    case 'RestElement': patternNames(p.argument, out); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
    default: break;
  }
  return out;
}
