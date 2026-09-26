// /api/* 라우터: 경로·메서드 확인(404/405), 다른 사이트에서 온 요청 거절(403), 오류를 JSON 으로 바꾸고
// 내부 정보는 응답에 넣지 않으며 로그에는 비밀처럼 보이는 부분을 가린 오류 종류만 남긴다.
import type { Context } from '@netlify/functions';
import { ApiError, errorResponse, json, MESSAGES, ok } from './http.mts';
import { Ctx, now } from './runtime.mts';
import { changePassword, deleteAccount, login, logout, me, recover, signup } from './accounts.mts';
import { deleteSlot, getMeta, getSlot, listSaves, parseSlot, putMeta, putSlot } from './saves.mts';

type Handler = (c: Ctx, param: string) => Promise<Response>;
interface Route { name: string; re: RegExp; methods: Record<string, Handler> }

const ROUTES: Route[] = [
  // 클라이언트가 API 사용 가능 여부를 확인하는 용도 (저장소에 접근하지 않음). api = 계약 버전, time = 서버 시각(ms)
  { name: 'health', re: /^\/api\/health$/, methods: { GET: async () => ok({ api: 1, time: now() }) } },
  { name: 'signup', re: /^\/api\/auth\/signup$/, methods: { POST: (c) => signup(c) } },
  { name: 'login', re: /^\/api\/auth\/login$/, methods: { POST: (c) => login(c) } },
  { name: 'logout', re: /^\/api\/auth\/logout$/, methods: { POST: (c) => logout(c) } },
  { name: 'me', re: /^\/api\/auth\/me$/, methods: { GET: (c) => me(c) } },
  { name: 'password', re: /^\/api\/auth\/password$/, methods: { POST: (c) => changePassword(c) } },
  { name: 'recover', re: /^\/api\/auth\/recover$/, methods: { POST: (c) => recover(c) } },
  { name: 'account', re: /^\/api\/auth\/account$/, methods: { DELETE: (c) => deleteAccount(c) } },
  // DELETE 본문을 전달하지 못하는 프록시·HTTP 클라이언트를 위한 같은 기능의 POST 경로
  { name: 'account-delete', re: /^\/api\/auth\/account\/delete$/, methods: { POST: (c) => deleteAccount(c) } },
  { name: 'saves', re: /^\/api\/saves$/, methods: { GET: (c) => listSaves(c) } },
  {
    name: 'slot', re: /^\/api\/saves\/([^/]*)$/, methods: {
      GET: (c, p) => getSlot(c, parseSlot(p)),
      PUT: (c, p) => putSlot(c, parseSlot(p)),
      DELETE: (c, p) => deleteSlot(c, parseSlot(p)),
    },
  },
  { name: 'meta', re: /^\/api\/meta$/, methods: { GET: (c) => getMeta(c), PUT: (c) => putMeta(c) } },
];

/**
 * 로그용 오류 문구 정리: URL, 메일 주소, IPv4·IPv6, 토큰·해시·저장소 키처럼 보이는 긴 문자열을 가린다.
 * (Netlify Blobs 오류에는 저장소 응답 본문이 그대로 붙을 수 있다 — 키에는 아이디·토큰 해시가 들어 있다)
 */
export function redact(msg: string): string {
  return String(msg)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]+/gi, '[url]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}/gi, (m) => (m.includes('::') || (m.match(/:/g)?.length ?? 0) >= 5 ? '[ip]' : m))
    .replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]')
    .replace(/\b[0-9a-f]{16,}\b/gi, '[redacted]')
    .slice(0, 200);
}

export async function handle(req: Request, context?: Context): Promise<Response> {
  let routeName = '-';
  try {
    let path: string;
    try { path = new URL(req.url).pathname; } catch { path = ''; }
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    let route: Route | undefined;
    let param = '';
    for (const r of ROUTES) {
      const m = r.re.exec(path);
      if (m) { route = r; param = m[1] ?? ''; break; }
    }
    if (!route) return errorResponse(new ApiError('not_found', 404));
    routeName = route.name;
    const h = route.methods[req.method.toUpperCase()];
    if (!h) {
      const allow = Object.keys(route.methods).join(', ');
      return errorResponse(new ApiError('method_not_allowed', 405, undefined, { Allow: allow }));
    }
    // 브라우저는 다른 사이트가 보낸 요청에 Sec-Fetch-Site: cross-site 를 붙인다. 이 API 는 같은 출처에서만 쓰므로 거절한다
    // (응답은 어차피 못 읽지만, 방문자 브라우저를 빌린 가입·로그인 시도·잠금 공격을 막는다. 안드로이드 앱의 대리 요청은 헤더가 없거나 same-origin)
    if ((req.headers.get('sec-fetch-site') ?? '').trim().toLowerCase() === 'cross-site') return errorResponse(new ApiError('forbidden', 403));
    return await h(new Ctx(req, context), param);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    // 요청 본문·토큰·IP 는 기록하지 않는다. 오류 종류와 가린 문구만 남긴다.
    const name = e instanceof Error ? String(e.name).slice(0, 40) : typeof e;
    const msg = e instanceof Error ? redact(e.message) : '';
    console.error(`[api] ${routeName} 처리 중 내부 오류: ${name} ${msg}`);
    return json(500, { ok: false, error: 'server_error', message: MESSAGES.server_error });
  }
}
