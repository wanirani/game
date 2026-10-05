// /api/* 라우터: 경로·메서드 확인(404/405), 다른 사이트에서 온 요청 거절(403), 오류를 JSON 으로 바꾸고
// 내부 정보는 응답에 넣지 않으며 로그에는 비밀처럼 보이는 부분을 가린 오류 종류만 남긴다.
import type { Context } from '@netlify/functions';
import { ApiError, errorResponse, json, MESSAGES, ok } from './http.mts';
import { Ctx, now } from './runtime.mts';
import { warnIfNoPepper } from './crypto.mts';
import { changePassword, deleteAccount, login, logout, me, recover, signup } from './accounts.mts';
import { deleteSlot, getMeta, getSlot, listSaves, parseSlot, putMeta, putSlot } from './saves.mts';
import { ingest, stats } from './telemetry.mts';
import { finishRun, getBoard, getDaily, getGhost, putNick, startRun } from './online.mts';

/** param = 첫 번째 경로 조각, params = 모든 경로 조각 (정규식 그룹) */
type Handler = (c: Ctx, param: string, params: string[]) => Promise<Response>;
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
  // 익명 통계 (docs/TELEMETRY.md): 묶음 받기 → 204 · 공개 요약 (식별 정보 없음, 짧게 캐시)
  { name: 'telemetry', re: /^\/api\/t$/, methods: { POST: (c) => ingest(c) } },
  { name: 'stats', re: /^\/api\/stats$/, methods: { GET: (c) => stats(c) } },
  // 온라인 기록 (docs/specs/online.md): 런 시작·제출(로그인), 순위표·고스트·일일 도전(공개, 짧게 캐시), 별명(로그인)
  { name: 'runs', re: /^\/api\/runs$/, methods: { POST: (c) => startRun(c) } },
  { name: 'runs-finish', re: /^\/api\/runs\/finish$/, methods: { POST: (c) => finishRun(c) } },
  { name: 'board', re: /^\/api\/boards\/([^/]+)$/, methods: { GET: (c, p) => getBoard(c, p) } },
  { name: 'ghost', re: /^\/api\/ghosts\/([^/]+)\/([^/]+)$/, methods: { GET: (c, _p, ps) => getGhost(c, ps[0], ps[1]) } },
  { name: 'daily', re: /^\/api\/daily$/, methods: { GET: (c) => getDaily(c) } },
  { name: 'nick', re: /^\/api\/profile\/nick$/, methods: { PUT: (c) => putNick(c) } },
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

/**
 * 안드로이드 앱(WebView 가상 출처)만 다른 출처 요청을 허용한다.
 *  - 앱은 게임 파일을 https://appassets.androidplatform.net 에서 연다. 지금 앱은 같은 출처 /api 를 앱의 프록시(ApiProxy.java)로 보내므로
 *    CORS 가 필요 없지만, 프록시가 없는 옛 앱은 계정 API 를 이 사이트로 직접 보낸다 → 브라우저 규칙상 cross-site (docs/ACCOUNTS.md §1).
 *  - 이 출처는 안드로이드 WebView 만 쓸 수 있고 일반 웹페이지는 흉내 낼 수 없다. 앱이 아닌 프로그램은 어차피 CORS 없이 직접 요청할 수 있으므로
 *    허용해도 새 공격 경로가 생기지 않는다(토큰은 쿠키가 아니라 Authorization 헤더 — 자동으로 붙지 않는다).
 *  - 그 밖의 다른 사이트(cross-site) 요청은 전처럼 403 으로 거절한다.
 */
export const APP_ORIGINS = new Set(['https://appassets.androidplatform.net']);
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Expose-Headers': 'Retry-After',
  'Access-Control-Max-Age': '600',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export async function handle(req: Request, context?: Context): Promise<Response> {
  warnIfNoPepper();
  const origin = (req.headers.get('origin') ?? '').trim();
  const app = APP_ORIGINS.has(origin) ? origin : null;
  // 사전 요청(preflight): 앱 출처에만 응답한다 (다른 출처는 아래 라우터가 405 로 거절)
  if (app && req.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Access-Control-Allow-Origin': app, Vary: 'Origin', 'Cache-Control': 'no-store' } });
  }
  const res = await route(req, context, !!app);
  if (app) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    res.headers.set('Access-Control-Allow-Origin', app);
    // 공개 캐시 응답의 Vary: Authorization 은 그대로 두고 Origin 을 더한다
    const vary = (res.headers.get('vary') ?? '').split(',').map((v) => v.trim()).filter((v) => v && v.toLowerCase() !== 'origin');
    res.headers.set('Vary', [...vary, 'Origin'].join(', '));
  }
  return res;
}

async function route(req: Request, context: Context | undefined, fromApp: boolean): Promise<Response> {
  let routeName = '-';
  try {
    let path: string;
    try { path = new URL(req.url).pathname; } catch { path = ''; }
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    let route: Route | undefined;
    let params: string[] = [];
    for (const r of ROUTES) {
      const m = r.re.exec(path);
      if (m) { route = r; params = m.slice(1).map((x) => x ?? ''); break; }
    }
    if (!route) return errorResponse(new ApiError('not_found', 404));
    routeName = route.name;
    const h = route.methods[req.method.toUpperCase()];
    if (!h) {
      const allow = Object.keys(route.methods).join(', ');
      return errorResponse(new ApiError('method_not_allowed', 405, undefined, { Allow: allow }));
    }
    // 브라우저는 다른 사이트가 보낸 요청에 Sec-Fetch-Site: cross-site 를 붙인다. 이 API 는 같은 출처에서만 쓰므로 거절한다
    // (응답은 어차피 못 읽지만, 방문자 브라우저를 빌린 가입·로그인 시도·잠금 공격을 막는다. 안드로이드 앱 출처만 예외 — 위 APP_ORIGINS)
    if (!fromApp && (req.headers.get('sec-fetch-site') ?? '').trim().toLowerCase() === 'cross-site') return errorResponse(new ApiError('forbidden', 403));
    return await h(new Ctx(req, context), params[0] ?? '', params);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    // 요청 본문·토큰·IP 는 기록하지 않는다. 오류 종류와 가린 문구만 남긴다.
    const name = e instanceof Error ? String(e.name).slice(0, 40) : typeof e;
    const msg = e instanceof Error ? redact(e.message) : '';
    console.error(`[api] ${routeName} 처리 중 내부 오류: ${name} ${msg}`);
    return json(500, { ok: false, error: 'server_error', message: MESSAGES.server_error });
  }
}
