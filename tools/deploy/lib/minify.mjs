// 안전한 축소기 — owner: DELIVERY-WEB
//
// minify(code) → 더 작은 코드. 토큰은 원문 그대로 두고 토큰 사이(공백·주석)만 줄인다:
//  - 주석과 들여쓰기를 없앤다.
//  - 줄바꿈은 자동 세미콜론 삽입(ASI)에 영향이 없다고 확실한 자리에서만 없앤다 (앞 토큰이 식을 끝낼 수 없는 기호이거나,
//    뒤 토큰이 앞 식을 이어 갈 수밖에 없는 기호일 때. return/break/continue/throw/yield/async/get/set/static/let/await/of 뒤는 항상 둔다).
//  - 붙이면 뜻이 바뀌는 자리(a + +b, 단어 두 개, 1 .x, / / …)에는 공백 하나.
// 결과는 다시 파싱해 원본과 AST 가 같은지 확인한다 (다르면 예외).
import crypto from 'node:crypto';
import { loadAcorn } from './acorn.mjs';

const RESTRICTED_KW = new Set(['return', 'break', 'continue', 'throw', 'yield', 'await']);
const RESTRICTED_NAME = new Set(['async', 'get', 'set', 'static', 'let', 'await', 'of', 'yield', 'accessor']);
// 식을 끝낼 수 없는 앞 토큰 (뒤에 반드시 무엇이 더 온다)
const SAFE_PREV = new Set(['{', '(', '[', ',', ';', ':', '?', '?.', '.', '=>', '...', '=', '_=', '||', '&&', '??', '|', '^', '&', '==/!=/===/!==', '</>/<=/>=', '<</>>/>>>', '+/-', '%', '*', '/', '**', 'prefix', '${',
  'typeof', 'void', 'delete', 'new', 'in', 'instanceof', 'else', 'do', 'case', 'extends', 'var', 'const']);
// 앞 식을 이어 갈 수밖에 없는 뒤 토큰 (줄바꿈이 있어도 ASI 가 일어나지 않는다)
const SAFE_NEXT = new Set(['}', ')', ']', ',', ';', ':', '?', '?.', '.', '=', '_=', '||', '&&', '??', '|', '^', '&', '==/!=/===/!==', '</>/<=/>=', '<</>>/>>>', '+/-', '%', '*', '**', 'in', 'instanceof']);

// 줄 끝 문자: \n \r U+2028 U+2029 (정규식 리터럴에 그대로 쓰면 줄바꿈으로 읽히므로 코드로 비교)
const hasLineTerminator = (s) => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 10 || c === 13 || c === 0x2028 || c === 0x2029) return true; } return false; };
const isWord = (ch) => ch !== undefined && (/[A-Za-z0-9_$#\\]/.test(ch) || ch.charCodeAt(0) > 127);

function label(t) { return t.type.keyword || t.type.label; }

export function minify(code, { verify = true, name = 'chunk' } = {}) {
  const acorn = loadAcorn();
  const tokens = [];
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', onToken: tokens });
  } catch (e) { throw new Error(`축소 전 구문 오류 (${name}): ${e.message}`); }
  const parts = [];
  let prev = null, prevText = '';
  for (const t of tokens) {
    if (t.type.label === 'eof') break;
    const text = code.slice(t.start, t.end);
    if (prev) {
      const gap = code.slice(prev.end, t.start);
      if (gap.length) {
        const nl = hasLineTerminator(gap);
        const pl = label(prev), nlb = label(t);
        let keepNl = false;
        if (nl) {
          const restricted = RESTRICTED_KW.has(pl) || (prev.type.label === 'name' && RESTRICTED_NAME.has(prev.value));
          const safe = !restricted && (SAFE_PREV.has(pl) || SAFE_NEXT.has(nlb));
          keepNl = !safe;
        }
        if (keepNl) parts.push('\n');
        else if (needSpace(prev, prevText, t, text)) parts.push(' ');
      }
      // 원래 붙어 있던 토큰(간격 없음)은 그대로 붙인다
    }
    parts.push(text);
    prev = t; prevText = text;
  }
  const out = parts.join('') + '\n';
  if (verify) {
    let ast2;
    try { ast2 = acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e) { throw new Error(`축소 결과 구문 오류 (${name}): ${e.message}`); }
    const a = fingerprint(ast), b = fingerprint(ast2);
    if (a !== b) throw new Error(`축소 결과의 AST 가 원본과 다릅니다 (${name})`);
  }
  return out;
}

function needSpace(prev, prevText, t, text) {
  const a = prevText[prevText.length - 1], b = text[0];
  if (isWord(a) && isWord(b)) return true;
  if ((a === '+' && b === '+') || (a === '-' && b === '-')) return true;
  if (a === '/' && (b === '/' || b === '*')) return true;
  if (a === '<' && b === '!') return true;
  if (a === '-' && b === '>') return true;
  if (a === '?' && b === '.') return true;
  if (prev.type.label === 'num' && b === '.') return true;
  return false;
}

/** AST 지문 (위치 정보 제외) */
export function fingerprint(ast) {
  const h = crypto.createHash('sha256');
  const walk = (n) => {
    if (n === null || n === undefined) { h.update('~'); return; }
    if (Array.isArray(n)) { h.update('['); for (const c of n) walk(c); h.update(']'); return; }
    if (typeof n !== 'object') { h.update(typeof n + ':' + String(n) + ';'); return; }
    if (n instanceof RegExp) { h.update('re:' + String(n) + ';'); return; }
    h.update('{');
    for (const k of Object.keys(n).sort()) {
      if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
      if (k === 'value' && n.regex) { h.update('value:re;'); continue; }
      if (k === 'value' && typeof n.value === 'bigint') { h.update('value:' + n.value.toString() + 'n;'); continue; }
      h.update(k + '=');
      walk(n[k]);
    }
    h.update('}');
  };
  walk(ast);
  return h.digest('hex');
}
