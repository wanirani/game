// /api/* 라우터: 경로·메서드 확인(404/405), 오류를 JSON 으로 바꾸고 내부 정보는 응답·로그에 남기지 않는다.
import type { Context } from '@netlify/functions';
import { ApiError, errorResponse, json, MESSAGES } from './http.mts';
import { Ctx } from './runtime.mts';
import { changePassword, deleteAccount, login, logout, me, recover, signup } from './accounts.mts';
import { deleteSlot, getMeta, getSlot, listSaves, parseSlot, putMeta, putSlot } from './saves.mts';

type Handler = (c: Ctx, param: string) => Promise<Response>;
interface Route { name: string; re: RegExp; methods: Record<string, Handler> }

const ROUTES: Route[] = [
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
    return await h(new Ctx(req, context), param);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    // 요청 본문·토큰·IP 는 기록하지 않는다. 오류 종류만 남긴다.
    const name = e instanceof Error ? e.name : typeof e;
    const msg = e instanceof Error ? String(e.message).slice(0, 160) : '';
    console.error(`[api] ${routeName} 처리 중 내부 오류: ${name} ${msg}`);
    return json(500, { ok: false, error: 'server_error', message: MESSAGES.server_error });
  }
}
