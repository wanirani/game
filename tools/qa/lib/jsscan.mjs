// Tiny static scanner for the game's ES modules (no parser dependency): masks comments and string/template text, finds
// function bodies by name and maps offsets to line numbers. Good enough for "is this call inside a draw function"
// questions; not a full JS parser (regex literals are recognised by the previous token, like most highlighters).
//
//   const src = fs.readFileSync(f, 'utf8');
//   const m = maskJs(src);                         // same length as src; comments and string contents → spaces
//   const fns = functionRanges(m);                 // [{ name, start, end, line }] (body braces, inclusive)
//   const L = lineIndex(src); L.line(offset) → 1-based line; L.text(line) → the source line
//   const draws = fns.filter((f) => DRAW_NAME.test(f.name));

/** Draw-path function names: draw*, render*, paint* (not painted/renderer), *Draw (paintedDraw), _draw…, blit*. */
export const DRAW_NAME = /^_*(?:draw|render|paint|blit)(?![a-z])|Draw$/;

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with', 'else', 'do', 'try', 'typeof', 'await', 'new', 'import', 'export', 'super', 'constructor_']);

/** Comments, string literals and template text become spaces (newlines kept); template ${…} stays code. */
export function maskJs(src) {
  const out = src.split('');
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  let i = 0;
  const tplStack = []; // brace depth at each open ${ of a template
  let depth = 0;
  let lastSig = ''; // last significant token kind/char in code
  let lastWord = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? n : j; blank(i, e); i = e; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; blank(i, e); i = e; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      blank(i + 1, j); i = j + 1; lastSig = 'str'; lastWord = ''; continue;
    }
    if (c === '`' || (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === depth)) {
      // template text: from after ` (or after the } that closes a ${) to the next ${ or closing `
      if (c === '}') { tplStack.pop(); }
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') break;
        j++;
      }
      blank(i + 1, j);
      if (j < n && src[j] === '$') { tplStack.push(depth); i = j + 2; lastSig = '('; lastWord = ''; continue; }
      i = j + 1; lastSig = 'str'; lastWord = ''; continue;
    }
    if (c === '/') {
      const regexOk = lastSig === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSig) || (lastSig === 'word' && KEYWORDS_BEFORE_REGEX.has(lastWord));
      if (regexOk) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (cls) { if (src[j] === ']') cls = false; } else if (src[j] === '[') cls = true; else if (src[j] === '/') break;
          j++;
        }
        blank(i + 1, j);
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        i = j; lastSig = 'str'; lastWord = ''; continue;
      }
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (/[A-Za-z_$0-9]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      lastWord = src.slice(i, j); lastSig = /^\d/.test(lastWord) ? 'num' : 'word';
      i = j; continue;
    }
    if (!/\s/.test(c)) { lastSig = c; lastWord = ''; }
    i++;
  }
  return out.join('');
}

/** Index of the brace that closes the one at `open` (masked source), or -1. */
export function matchBrace(m, open) {
  let d = 0;
  for (let i = open; i < m.length; i++) {
    const c = m[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}
function matchParen(m, open) {
  let d = 0;
  for (let i = open; i < m.length; i++) {
    const c = m[i];
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}
/** End of an expression-bodied arrow starting at i: the first , ; or unmatched closer at depth 0. */
function exprEnd(m, i) {
  let d = 0;
  for (let k = i; k < m.length; k++) {
    const c = m[k];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) return k - 1; d--; }
    else if ((c === ',' || c === ';') && d === 0) return k - 1;
  }
  return m.length - 1;
}

/**
 * Named function bodies in masked source: function declarations/expressions, class and object methods
 * (incl. get/set/static/async), and arrows assigned to a name (`name = (…) => …`, `name: (…) => …`).
 * → [{ name, start, end, line }] where start..end is the body (braces included, or the expression of an arrow).
 */
export function functionRanges(m) {
  const out = [];
  const L = lineIndex(m);
  const seen = new Set();
  const add = (name, start, end) => { if (start < 0 || end < start || seen.has(start)) return; seen.add(start); out.push({ name, start, end, line: L.line(start) }); };
  let r;
  // function declarations / expressions
  const fnRe = /\bfunction\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g;
  while ((r = fnRe.exec(m))) {
    let name = r[1] || '';
    if (!name) { const before = m.slice(Math.max(0, r.index - 80), r.index); const b = before.match(/([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s+)?$/); if (b) name = b[1]; }
    const p = matchParen(m, r.index + r[0].length - 1);
    if (p < 0) continue;
    const ob = m.slice(p + 1).search(/\S/) + p + 1;
    if (m[ob] !== '{') continue;
    add(name, ob, matchBrace(m, ob));
  }
  // methods: NAME(…) { at a statement/member boundary
  const mRe = /(^|[;{},\n])\s*((?:static\s+|async\s+|get\s+|set\s+|\*\s*)*)(#?[A-Za-z_$][\w$]*)\s*\(/g;
  while ((r = mRe.exec(m))) {
    const name = r[3];
    if (NOT_METHODS.has(name)) continue;
    const po = r.index + r[0].length - 1;
    const p = matchParen(m, po);
    if (p < 0) continue;
    const rest = m.slice(p + 1, p + 40);
    const k = rest.search(/\S/);
    if (k < 0 || rest[k] !== '{') continue;
    const ob = p + 1 + k;
    add(name, ob, matchBrace(m, ob));
    mRe.lastIndex = po + 1;
  }
  // arrows assigned to a name
  const aRe = /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(\(|[A-Za-z_$][\w$]*\s*=>)/g;
  while ((r = aRe.exec(m))) {
    const name = r[1];
    if (/^(const|let|var|return|case|default)$/.test(name)) continue;
    let arrowAt;
    if (r[2] === '(') {
      const po = r.index + r[0].length - 1;
      const p = matchParen(m, po);
      if (p < 0) continue;
      const after = m.slice(p + 1, p + 8);
      const k = after.search(/\S/);
      if (k < 0 || after.slice(k, k + 2) !== '=>') continue;
      arrowAt = p + 1 + k + 2;
    } else arrowAt = r.index + r[0].length;
    const k2 = m.slice(arrowAt).search(/\S/);
    if (k2 < 0) continue;
    const b0 = arrowAt + k2;
    if (m[b0] === '{') add(name, b0, matchBrace(m, b0));
    else add(name, b0, exprEnd(m, b0));
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** Offsets → lines. */
export function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  const lines = src.split('\n');
  return {
    line(off) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; },
    text(line) { return lines[line - 1] ?? ''; },
    count: lines.length,
  };
}

/** Innermost named function containing the offset (or null). */
export function enclosing(fns, off) {
  let best = null;
  for (const f of fns) if (f.start <= off && off <= f.end && (!best || f.start >= best.start)) best = f;
  return best;
}
/** Every function containing the offset, outermost first. */
export function chain(fns, off) { return fns.filter((f) => f.start <= off && off <= f.end).sort((a, b) => a.start - b.start); }
