// acorn (JavaScript 파서) 불러오기 — owner: DELIVERY-WEB
//
// npm 의존성 없이 Node.js 에 들어 있는 acorn 을 쓴다 (Node 는 REPL 용으로 acorn 을 내장한다).
//  1. process.binding('natives') 로 내장 소스를 읽어 CommonJS 처럼 평가한다 (플래그 필요 없음).
//  2. 안 되면 --expose-internals 로 실행된 경우의 내부 require.
// 둘 다 안 되면 오류 메시지로 방법을 알려 준다.
import { createRequire } from 'node:module';

let cached = null;

export function loadAcorn() {
  if (cached) return cached;
  const errs = [];
  try {
    // 문서화만 된 폐기 예정 API (DEP0111): 경고를 한 번 띄울 수 있어 잠시 막는다
    const emit = process.emitWarning;
    process.emitWarning = () => {};
    let natives;
    try { natives = process.binding('natives'); } finally { process.emitWarning = emit; }
    const src = natives?.['internal/deps/acorn/acorn/dist/acorn'];
    if (typeof src === 'string' && src.length > 1000) {
      const mod = { exports: {} };
      // UMD 파일: exports/module 이 있으면 CommonJS 로 채운다
      new Function('exports', 'module', 'define', src)(mod.exports, mod, undefined);
      if (typeof mod.exports.parse === 'function') { cached = mod.exports; return cached; }
    }
    errs.push('natives: acorn 없음');
  } catch (e) { errs.push('natives: ' + e.message); }
  try {
    const req = createRequire(import.meta.url);
    const a = req('internal/deps/acorn/acorn/dist/acorn');
    if (typeof a?.parse === 'function') { cached = a; return cached; }
  } catch (e) { errs.push('internal require: ' + e.message); }
  throw new Error(`Node 내장 acorn 을 불러오지 못했습니다 (${errs.join('; ')}). Node 20 이상에서 'node --expose-internals ...' 로 실행해 보세요.`);
}

/** 모듈 코드 파싱 (최신 문법, 위치 start/end 포함) */
export function parseModule(code, file = '(code)', extra = {}) {
  const acorn = loadAcorn();
  try {
    return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: false, ...extra });
  } catch (e) {
    const where = e.loc ? `${file}:${e.loc.line}:${e.loc.column + 1}` : file;
    const err = new Error(`구문 오류 ${where}: ${e.message}`);
    err.cause = e;
    throw err;
  }
}
