// HTTP 공통: JSON 응답, 오류 코드와 한국어 메시지, 크기 제한이 있는 JSON 본문 읽기.
// 모든 응답은 {ok:boolean, error?:코드, message?:한국어 문장, ...} 형태의 UTF-8 JSON 이다.

export const MESSAGES: Record<string, string> = {
  bad_request: '요청 형식이 올바르지 않습니다.',
  bad_json: '요청 데이터를 읽을 수 없습니다.',
  payload_too_large: '보내는 데이터가 너무 큽니다.',
  invalid_id: '아이디는 영문 소문자로 시작하는 4~16자의 영문 소문자, 숫자, 밑줄(_)로 만들어 주세요.',
  reserved_id: '사용할 수 없는 아이디입니다. 다른 아이디를 입력해 주세요.',
  id_taken: '이미 사용 중인 아이디입니다.',
  invalid_password: '비밀번호는 8~64자로 입력해 주세요. (줄바꿈 같은 제어 문자는 쓸 수 없습니다)',
  password_same_as_id: '비밀번호는 아이디와 다르게 정해 주세요.',
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
};

export function json(status: number, body: Record<string, unknown>, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...(headers ?? {}) } });
}

export function ok(body: Record<string, unknown> = {}, status = 200): Response {
  return json(status, { ok: true, ...body });
}

export function errorResponse(err: ApiError): Response {
  const message = MESSAGES[err.code] ?? MESSAGES.server_error;
  return json(err.status, { ok: false, error: err.code, message, ...(err.extra ?? {}) }, err.headers);
}

export const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * 요청 본문을 최대 maxBytes 까지만 읽어 JSON 객체로 돌려준다.
 * - 크기 초과 → 413 payload_too_large (Content-Length 를 믿지 않고 실제로 센다)
 * - UTF-8 이 아니거나 JSON 이 아니거나 비어 있으면 → 400 bad_json
 * - 최상위가 객체가 아니면 → 400 bad_request
 */
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, any>> {
  const declared = req.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) fail('payload_too_large', 413);
  if (!req.body) fail('bad_json', 400);
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
  if (total === 0) fail('bad_json', 400);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  let parsed: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
    parsed = JSON.parse(text);
  } catch {
    fail('bad_json', 400);
  }
  if (!isObj(parsed)) fail('bad_request', 400);
  return parsed;
}
