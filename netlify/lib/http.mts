// HTTP 공통: JSON 응답, 오류 코드와 한국어 메시지, 크기·깊이 제한이 있는 JSON 본문 읽기.
// 모든 응답은 {ok:boolean, error?:코드, message?:한국어 문장, ...} 형태의 UTF-8 JSON 이다.
import { JSON_MAX_DEPTH } from './config.mts';

export const MESSAGES: Record<string, string> = {
  bad_request: '요청 형식이 올바르지 않습니다.',
  bad_json: '요청 데이터를 읽을 수 없습니다.',
  unsupported_media_type: '요청 형식이 올바르지 않습니다. (JSON 으로 보내야 합니다)',
  forbidden: '허용되지 않는 요청입니다.',
  payload_too_large: '보내는 데이터가 너무 큽니다.',
  invalid_id: '아이디는 영문 소문자로 시작하는 4~16자의 영문 소문자, 숫자, 밑줄(_)로 만들어 주세요.',
  reserved_id: '사용할 수 없는 아이디입니다. 다른 아이디를 입력해 주세요.',
  id_taken: '이미 사용 중인 아이디입니다.',
  invalid_password: '비밀번호는 8~64자로 입력해 주세요. (줄바꿈 같은 제어 문자는 쓸 수 없습니다)',
  password_same_as_id: '비밀번호는 아이디와 다르게 정해 주세요.',
  weak_password: '너무 흔하거나 추측하기 쉬운 비밀번호입니다. 아이디가 들어가지 않은, 다른 사람이 떠올리기 어려운 비밀번호로 정해 주세요.',
  same_password: '새 비밀번호가 지금 비밀번호와 같습니다.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
  wrong_password: '비밀번호가 올바르지 않습니다.',
  invalid_recovery: '아이디 또는 복구 코드가 올바르지 않습니다.',
  unauthorized: '로그인이 필요합니다. 다시 로그인해 주세요.',
  locked: '시도가 너무 많아 잠시 잠겼습니다. 잠시 후 다시 시도해 주세요.',
  rate_limited: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  signup_limited: '짧은 시간에 너무 많은 계정이 만들어졌습니다. 1시간쯤 뒤에 다시 시도해 주세요.',
  invalid_slot: '저장 슬롯 번호가 올바르지 않습니다. (1~3)',
  slot_empty: '이 슬롯에는 클라우드에 저장된 데이터가 없습니다.',
  invalid_save: '저장 데이터가 손상되었거나 형식이 올바르지 않습니다.',
  invalid_meta: '기록 데이터의 형식이 올바르지 않습니다.',
  conflict: '다른 기기에서 먼저 저장한 데이터가 있습니다.',
  // 온라인 기록 (docs/specs/online.md)
  invalid_board: '순위표 이름이 올바르지 않습니다.',
  invalid_run: '이 기록의 런 정보를 확인할 수 없습니다.',
  run_expired: '기록을 보낼 수 있는 시간이 지났습니다. (런 시작 후 6시간 · 서바이벌·무한의 탑은 30시간)',
  run_used: '이미 제출한 기록입니다.',
  invalid_result: '기록 값이 올바르지 않습니다.',
  implausible_time: '기록 시간이 실제로 걸린 시간과 맞지 않습니다.',
  invalid_ghost: '고스트 데이터가 올바르지 않거나 너무 큽니다.',
  ghost_not_found: '이 순위에는 고스트가 없습니다.',
  invalid_nick: '별명은 2~12자의 한글, 영문, 숫자, 밑줄(_)로 만들어 주세요.',
  banned_nick: '사용할 수 없는 별명입니다. 다른 별명을 입력해 주세요.',
  nick_is_id: '별명에 로그인 아이디를 넣을 수 없습니다. (순위표에 공개됩니다)',
  not_found: '요청한 주소를 찾을 수 없습니다.',
  method_not_allowed: '허용되지 않는 요청 방식입니다.',
  server_error: '서버에 일시적인 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
};

export type Extra = Record<string, unknown>;

/** 처리 중 던지면 라우터가 그대로 JSON 오류 응답으로 바꾼다 */
export class ApiError extends Error {
  status: number;
  code: string;
  extra: Extra | undefined;
  headers: Record<string, string> | undefined;
  constructor(code: string, status: number, extra?: Extra, headers?: Record<string, string>) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.extra = extra;
    this.headers = headers;
  }
}

export function fail(code: string, status: number, extra?: Extra, headers?: Record<string, string>): never {
  throw new ApiError(code, status, extra, headers);
}

/** 429 응답 (Retry-After 헤더 + 본문 retryAfter 초) */
export function failRetry(code: string, retryAfterSec: number): never {
  const s = Math.max(1, Math.ceil(retryAfterSec));
  throw new ApiError(code, 429, { retryAfter: s }, { 'Retry-After': String(s) });
}

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // API 응답을 문서로 열거나 다른 사이트가 끼워 넣어도 아무것도 실행·표시되지 않게
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function json(status: number, body: Record<string, unknown>, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...(headers ?? {}) } });
}

export function ok(body: Record<string, unknown> = {}, status = 200): Response {
  return json(status, { ok: true, ...body });
}

/** 본문 없는 204 응답 (공통 보안 헤더 그대로; 익명 통계 수집 POST /api/t) */
export function noContent(): Response {
  const { 'Content-Type': _ct, ...h } = BASE_HEADERS;
  return new Response(null, { status: 204, headers: h });
}

export function errorResponse(err: ApiError): Response {
  const message = MESSAGES[err.code] ?? MESSAGES.server_error;
  return json(err.status, { ok: false, error: err.code, message, ...(err.extra ?? {}) }, err.headers);
}

export const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 본문을 최대 maxBytes 까지만 읽는다 (Content-Length 를 믿지 않고 실제로 센다). 비었으면 빈 배열 */
export async function readBytes(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = req.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) fail('payload_too_large', 413);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* 이미 닫힘 */ }
      fail('payload_too_large', 413);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return buf;
}

/**
 * JSON 텍스트의 최대 중첩 깊이 ([ 와 { 를 문자열 밖에서만 센다). JSON.parse 전에 재서
 * 수십만 겹 배열 같은 본문이 뒤의 재귀 처리(JSON.stringify 등)에서 스택을 넘치게 하지 못하게 한다.
 */
export function jsonDepth(text: string): number {
  let depth = 0, max = 0, inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inStr) {
      if (ch === 92) i++; // \ 다음 글자 건너뜀
      else if (ch === 34) inStr = false;
    } else if (ch === 34) inStr = true;
    else if (ch === 91 || ch === 123) { if (++depth > max) max = depth; }
    else if (ch === 93 || ch === 125) depth--;
  }
  return max;
}

/**
 * Content-Type 이 application/json 인가 (매개변수·대소문자 무시).
 * 다른 사이트는 fetch(no-cors)·form 으로 text/plain·form 형식 본문만 사전 확인(preflight) 없이 보낼 수 있으므로,
 * JSON 만 받으면 다른 사이트가 방문자 브라우저로 가입·로그인 요청을 대신 보내게(CSRF) 할 수 없다.
 */
function isJsonType(req: Request): boolean {
  return (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() === 'application/json';
}

function parseJsonObject(req: Request, buf: Uint8Array): Record<string, any> {
  if (!isJsonType(req)) fail('unsupported_media_type', 415);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    fail('bad_json', 400);
  }
  if (jsonDepth(text!) > JSON_MAX_DEPTH) fail('bad_request', 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text!);
  } catch {
    fail('bad_json', 400);
  }
  if (!isObj(parsed)) fail('bad_request', 400);
  return parsed;
}

/**
 * 요청 본문을 최대 maxBytes 까지만 읽어 JSON 객체로 돌려준다.
 * - 크기 초과 → 413 payload_too_large (Content-Length 를 믿지 않고 실제로 센다)
 * - 비어 있으면 → 400 bad_json
 * - Content-Type 이 application/json 이 아니면 → 415 unsupported_media_type
 * - UTF-8 이 아니거나 JSON 이 아니면 → 400 bad_json, 너무 깊게 중첩됐거나 최상위가 객체가 아니면 → 400 bad_request
 */
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, any>> {
  const buf = await readBytes(req, maxBytes);
  if (buf.byteLength === 0) fail('bad_json', 400);
  return parseJsonObject(req, buf);
}

/** 본문이 없어도 되는 요청용: 비었으면 {}, 있으면 readJson 과 같은 규칙 */
export async function readOptionalJson(req: Request, maxBytes: number): Promise<Record<string, any>> {
  const buf = await readBytes(req, maxBytes);
  if (buf.byteLength === 0) return {};
  return parseJsonObject(req, buf);
}
