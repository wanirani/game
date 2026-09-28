package com.bloodnocturne.game;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

/**
 * 계정 API 프록시: 앱 페이지(https://appassets.androidplatform.net)의 /api/* 요청을 계정 서버(Netlify 사이트)로 대신 보낸다.
 * (docs/ACCOUNTS.md §1, platform §9.4-5 / P-34, MASTER_PLAN §1.20)
 *
 * - 서버 주소는 빌드할 때 tools/apk/api_origin.txt 에서 읽어 APK 의 assets/app/apk.json 에 넣는다 (DELIVER-APK 가 실제 사이트로 바꾼다).
 * - 페이지 입장에서는 같은 출처 요청이라 CORS 가 없다. 헤더·본문은 그대로 보내고, 상태 코드·응답 헤더·본문도 그대로 돌려준다.
 *   캐시하지 않는다 (Cache-Control: no-store). 전체 15 초가 지나면 JSON 오류(504 timeout)를 돌려준다.
 * - WebView 의 shouldInterceptRequest 는 요청 본문을 주지 않는다. 그래서 앱 조각(assets/app/head_inject.html)이 fetch 를 감싸
 *   요청마다 BNAndroid.apiStash(id, method, headers, body) 로 본문·헤더를 먼저 맡기고, 주소에 ?__bnreq=<id> 를 붙여 보낸다.
 *   여기서 그 id 로 맡긴 요청을 찾아 원래 모습 그대로 서버에 보낸다 (id 는 서버로 보내지 않는다).
 * - 서버에 닿지 못하면(오프라인·DNS·TLS·시간 초과) JSON 오류와 함께 X-BN-Proxy-Error 헤더를 붙인다. 앱 조각의 fetch 는 이 헤더를 보면
 *   네트워크 오류(TypeError)로 바꿔 던진다 → src/core/cloud.js 는 웹에서 서버에 못 닿았을 때와 똑같이 처리한다.
 *
 * 이 클래스는 android.* 를 쓰지 않는다: tools/apk/verify_apk.mjs 가 호스트 JVM 에서 컴파일해 로컬 API 서버에 대고 시험한다
 * (tools/apk/ApiProxyCheck.java). WebResourceResponse 로 바꾸는 일은 AssetServer 가 한다.
 */
final class ApiProxy {
    static final int TIMEOUT_MS = 15000;
    static final int MAX_BODY_BYTES = 4 * 1024 * 1024;       // 맡길 수 있는 요청 본문 (서버 한도는 슬롯 512KB)
    static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;   // 받아 올 응답 본문
    static final int MAX_STASH = 32;
    static final long STASH_TTL_MS = 60000;
    /** 맡긴 요청 id 를 싣는 쿼리 이름 (서버로는 보내지 않는다) */
    static final String REQ_PARAM = "__bnreq";
    /** 프록시가 서버에 닿지 못했을 때 붙이는 헤더: network | timeout | unavailable */
    static final String ERROR_HEADER = "X-BN-Proxy-Error";

    static final String MSG_NETWORK = "서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.";
    static final String MSG_TIMEOUT = "서버 응답이 너무 늦습니다. 잠시 후 다시 시도해 주세요.";
    static final String MSG_UNAVAILABLE = "이 앱에는 계정 서버 주소가 설정되어 있지 않습니다.";
    static final String MSG_METHOD = "허용되지 않는 요청 방식입니다.";

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Pattern HTTPS_ORIGIN = Pattern.compile("^https://[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?$");
    private static final Pattern LOCAL_ORIGIN = Pattern.compile("^http://(?:localhost|127\\.0\\.0\\.1)(?::[0-9]{1,5})?$");
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{8,64}$");
    private static final Pattern TOKEN = Pattern.compile("^[!#$%&'*+.^_`|~0-9A-Za-z-]+$");
    /** 서버로 보내지 않는 요청 헤더 (연결·브라우저 문맥·쿠키·WebView 가 붙이는 앱 패키지 이름) — sec-*, proxy-* 도 */
    private static final String[] DROP_REQUEST = {
        "host", "connection", "content-length", "transfer-encoding", "accept-encoding", "cookie", "cookie2", "origin", "referer",
        "keep-alive", "te", "trailer", "upgrade", "expect", "x-requested-with", "x-bn-req",
    };
    /** 페이지로 넘기지 않는 응답 헤더 (연결 단위·이미 풀어 둔 압축·쿠키·HSTS). Content-Type 은 WebResourceResponse 인자로 따로 준다 */
    private static final String[] DROP_RESPONSE = {
        "connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length", "content-type", "set-cookie", "set-cookie2",
        "trailer", "upgrade", "strict-transport-security", "alt-svc", "public-key-pins",
    };
    private static final ExecutorService POOL = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "bn-api-proxy");
        t.setDaemon(true);
        return t;
    });

    /** 프록시 응답 (AssetServer 가 WebResourceResponse 로 바꾼다) */
    static final class Result {
        final int status;
        final String reason;
        final String mime;
        final String charset;
        final Map<String, String> headers;
        final byte[] body;
        /** 로그용 설명 (페이지로 보내지 않음) */
        final String detail;

        Result(int status, String reason, String mime, String charset, Map<String, String> headers, byte[] body, String detail) {
            this.status = status;
            this.reason = reason;
            this.mime = mime;
            this.charset = charset;
            this.headers = headers;
            this.body = body;
            this.detail = detail;
        }

        String header(String name) {
            return headers.get(name);
        }
    }

    private static final class Stash {
        final String method;
        final List<String[]> headers;
        final byte[] body;
        final long at;

        Stash(String method, List<String[]> headers, byte[] body, long at) {
            this.method = method;
            this.headers = headers;
            this.body = body;
            this.at = at;
        }
    }

    private final String origin;
    private final String userAgent;
    private final int timeoutMs;
    private final ConcurrentHashMap<String, Stash> stash = new ConcurrentHashMap<>();

    /** origin: parseOrigin() 으로 검사한 값 (null 이면 프록시 꺼짐 → 503 unavailable) */
    ApiProxy(String origin, String userAgent, int timeoutMs) {
        this.origin = origin;
        this.userAgent = userAgent;
        this.timeoutMs = timeoutMs > 0 ? timeoutMs : TIMEOUT_MS;
    }

    String origin() {
        return origin;
    }

    /**
     * api_origin.txt 형식의 글에서 서버 주소를 읽는다: '#' 주석과 빈 줄을 건너뛴 첫 줄, 'https://호스트[:포트]' (경로·끝 슬래시 없음).
     * allowLocalHttp 는 시험용 (http://localhost, http://127.0.0.1). 형식이 틀리면 null.
     */
    static String parseOrigin(String text, boolean allowLocalHttp) {
        if (text == null) return null;
        for (String line : text.split("\n")) {
            String s = line.trim();
            if (s.isEmpty() || s.startsWith("#")) continue;
            while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
            if (HTTPS_ORIGIN.matcher(s).matches() && s.indexOf("..") < 0) return s.toLowerCase(Locale.ROOT);
            if (allowLocalHttp && LOCAL_ORIGIN.matcher(s).matches()) return s;
            return null;
        }
        return null;
    }

    // ───────────────────────── 요청 맡기기 (BNAndroid.apiStash) ─────────────────────────

    /** head_inject 의 fetch 가 요청 직전에 부른다. headerLines: "이름: 값" 줄들. 맡기지 못하면 false (페이지가 네트워크 오류로 처리) */
    boolean stash(String id, String method, String headerLines, String body) {
        if (id == null || !ID.matcher(id).matches()) return false;
        String m = method == null ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        if (!TOKEN.matcher(m).matches()) return false;
        byte[] b = body == null ? null : body.getBytes(UTF8);
        if (b != null && b.length > MAX_BODY_BYTES) return false;
        long now = System.currentTimeMillis();
        purge(now);
        stash.put(id, new Stash(m, parseHeaderLines(headerLines), b, now));
        return true;
    }

    int stashed() {
        return stash.size();
    }

    private void purge(long now) {
        String oldest = null;
        long oldestAt = Long.MAX_VALUE;
        for (Iterator<Map.Entry<String, Stash>> it = stash.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<String, Stash> e = it.next();
            if (now - e.getValue().at > STASH_TTL_MS) {
                it.remove();
                continue;
            }
            if (e.getValue().at < oldestAt) {
                oldestAt = e.getValue().at;
                oldest = e.getKey();
            }
        }
        if (stash.size() >= MAX_STASH && oldest != null) stash.remove(oldest);
    }

    static List<String[]> parseHeaderLines(String lines) {
        List<String[]> out = new ArrayList<>();
        if (lines == null) return out;
        for (String line : lines.split("\n")) {
            int c = line.indexOf(':');
            if (c <= 0 || line.indexOf('\r') >= 0) continue;
            String name = line.substring(0, c).trim();
            String value = line.substring(c + 1).trim();
            if (!TOKEN.matcher(name).matches()) continue;
            out.add(new String[] {name, value});
        }
        return out;
    }

    static boolean forwardableRequestHeader(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.startsWith("sec-") || n.startsWith("proxy-")) return false;
        for (String d : DROP_REQUEST) if (d.equals(n)) return false;
        return true;
    }

    static boolean forwardableResponseHeader(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.startsWith("proxy-")) return false;
        for (String d : DROP_RESPONSE) if (d.equals(n)) return false;
        return true;
    }

    // ───────────────────────── 전달 ─────────────────────────

    /**
     * pathQuery: 페이지가 요청한 경로 + 쿼리 ('/api/...', 퍼센트 인코딩 그대로). pageHeaders: WebView 가 알려 준 요청 헤더 (맡긴 요청이 없을 때만 쓴다).
     * 응답은 언제나 Result (예외를 던지지 않는다).
     */
    Result forward(String method, String pathQuery, Map<String, String> pageHeaders) {
        String path = pathQuery == null ? "" : pathQuery;
        String query = null;
        int q = path.indexOf('?');
        if (q >= 0) {
            query = path.substring(q + 1);
            path = path.substring(0, q);
        }
        String id = null;
        if (query != null) {
            StringBuilder kept = new StringBuilder();
            for (String part : query.split("&")) {
                if (part.isEmpty()) continue;
                if (part.startsWith(REQ_PARAM + "=")) {
                    id = part.substring(REQ_PARAM.length() + 1);
                    continue;
                }
                if (kept.length() > 0) kept.append('&');
                kept.append(part);
            }
            query = kept.length() > 0 ? kept.toString() : null;
        }
        Stash s = id == null ? null : stash.remove(id);
        final String m = s != null ? s.method : (method == null ? "GET" : method.toUpperCase(Locale.ROOT));
        final List<String[]> headers = s != null ? s.headers : fromMap(pageHeaders);
        final byte[] body = s != null ? s.body : null;
        if (!path.equals("/api") && !path.startsWith("/api/")) return error(404, "not_found", "없는 API 경로입니다.", null, "not an /api path: " + path);
        // 인코딩된 점·슬래시(%2e, %2f, %5c)로 /api 밖(사이트의 다른 경로)으로 나가지 못하게 한다 (AssetServer 는 인코딩된 경로를 그대로 넘긴다)
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.contains("%2e") || lower.contains("%2f") || lower.contains("%5c") || path.indexOf('\\') >= 0) {
            return error(404, "not_found", "없는 API 경로입니다.", null, "encoded dot/slash in api path: " + path);
        }
        if (origin == null) return error(503, "unavailable", MSG_UNAVAILABLE, "unavailable", "no api origin configured");
        final String target = origin + path + (query != null ? "?" + query : "");
        final boolean stashMissing = id != null && s == null;
        // 페이지가 본문을 맡겼다고 표시했는데(__bnreq) 맡긴 요청이 없으면(시간 초과·개수 초과로 버려짐) 본문 없이 보내지 않는다:
        // 본문이 빠진 요청은 다른 요청이 된다 (예: 로그아웃 {all:true} 가 이 기기만 로그아웃). 네트워크 오류로 돌려 클라이언트가 다시 시도하게 한다
        if (stashMissing && !m.equals("GET") && !m.equals("HEAD")) {
            return error(502, "network", MSG_NETWORK, "network", "stash id not found: " + m + " " + path + " (not forwarded without its body)");
        }
        final AtomicReference<HttpURLConnection> conn = new AtomicReference<>();
        Future<Result> f = POOL.submit(() -> send(target, m, headers, body, conn));
        try {
            Result r = f.get(timeoutMs, TimeUnit.MILLISECONDS);
            if (stashMissing) return withDetail(r, "stash id not found (body not forwarded)");
            return r;
        } catch (TimeoutException e) {
            f.cancel(true);
            HttpURLConnection c = conn.get();
            if (c != null) c.disconnect();
            return error(504, "timeout", MSG_TIMEOUT, "timeout", "no response within " + timeoutMs + " ms: " + m + " " + path);
        } catch (ExecutionException e) {
            Throwable c = e.getCause();
            if (c instanceof SocketTimeoutException) return error(504, "timeout", MSG_TIMEOUT, "timeout", String.valueOf(c));
            return error(502, "network", MSG_NETWORK, "network", String.valueOf(c));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return error(502, "network", MSG_NETWORK, "network", "interrupted");
        }
    }

    private Result send(String target, String m, List<String[]> headers, byte[] body, AtomicReference<HttpURLConnection> ref) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(target).openConnection();
        ref.set(c);
        try {
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            try {
                c.setRequestMethod(m);
            } catch (ProtocolException e) {
                return error(405, "method_not_allowed", MSG_METHOD, null, "method not supported: " + m);
            }
            for (String[] h : headers) if (forwardableRequestHeader(h[0])) c.addRequestProperty(h[0], h[1]);
            if (userAgent != null && !userAgent.isEmpty() && c.getRequestProperty("User-Agent") == null) c.setRequestProperty("User-Agent", userAgent);
            boolean canBody = !m.equals("GET") && !m.equals("HEAD") && !m.equals("OPTIONS") && !m.equals("TRACE");
            boolean needsBody = m.equals("POST") || m.equals("PUT") || m.equals("PATCH");
            if (canBody && (body != null || needsBody)) {
                byte[] b = body == null ? new byte[0] : body;
                c.setDoOutput(true);
                // 고정 길이 스트리밍 모드는 쓰지 않는다: 그 모드에서 401 응답이 오면 HttpURLConnection 이 본문을 버린다
                // (본문은 최대 4MB 라 버퍼링해도 된다 — Content-Length 는 연결이 채운다)
                OutputStream os = c.getOutputStream();
                try {
                    os.write(b);
                } finally {
                    os.close();
                }
            }
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) return error(502, "network", MSG_NETWORK, "network", "upstream redirect " + code + " not followed");
            if (code < 100 || code > 599) return error(502, "network", MSG_NETWORK, "network", "bad upstream status " + code);
            String ctype = null;
            Map<String, String> out = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
            for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                String k = e.getKey();
                if (k == null || e.getValue() == null) continue;
                String v = join(e.getValue());
                if (k.equalsIgnoreCase("content-type")) {
                    ctype = v;
                    continue;
                }
                if (forwardableResponseHeader(k)) out.put(k, v);
            }
            out.put("Cache-Control", "no-store");
            out.put("X-BN-Proxy", "1");
            byte[] data;
            if (m.equals("HEAD") || code == 204 || code == 304) data = new byte[0];
            else {
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                data = in == null ? new byte[0] : readCapped(in);
            }
            String mime = "application/octet-stream";
            String charset = null;
            if (ctype != null) {
                String[] parts = ctype.split(";");
                String mt = parts[0].trim().toLowerCase(Locale.ROOT);
                if (!mt.isEmpty()) mime = mt;
                for (int i = 1; i < parts.length; i++) {
                    String p = parts[i].trim();
                    if (p.toLowerCase(Locale.ROOT).startsWith("charset=")) charset = p.substring(8).trim().replace("\"", "");
                }
            }
            return new Result(code, reasonOf(code, c.getResponseMessage()), mime, charset, out, data, "upstream " + code);
        } finally {
            c.disconnect();
        }
    }

    private static byte[] readCapped(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(4096);
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (bo.size() + n > MAX_RESPONSE_BYTES) throw new IOException("response larger than " + MAX_RESPONSE_BYTES + " bytes");
                bo.write(buf, 0, n);
            }
            return bo.toByteArray();
        } finally {
            in.close();
        }
    }

    // ───────────────────────── 도우미 ─────────────────────────

    private static List<String[]> fromMap(Map<String, String> m) {
        List<String[]> out = new ArrayList<>();
        if (m == null) return out;
        for (Map.Entry<String, String> e : m.entrySet()) {
            if (e.getKey() == null || e.getValue() == null) continue;
            if (!TOKEN.matcher(e.getKey()).matches() || e.getValue().indexOf('\n') >= 0 || e.getValue().indexOf('\r') >= 0) continue;
            out.add(new String[] {e.getKey(), e.getValue()});
        }
        return out;
    }

    private static String join(List<String> vs) {
        StringBuilder sb = new StringBuilder();
        for (String v : vs) {
            if (v == null) continue;
            if (sb.length() > 0) sb.append(", ");
            sb.append(v);
        }
        return sb.toString();
    }

    /** WebResourceResponse 는 ASCII 로 된 빈 문자열이 아닌 사유 문구만 받는다 */
    static String reasonOf(int code, String given) {
        if (given != null) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < given.length(); i++) {
                char ch = given.charAt(i);
                if (ch >= 0x20 && ch < 0x7f) sb.append(ch);
            }
            String s = sb.toString().trim();
            if (!s.isEmpty()) return s;
        }
        switch (code) {
            case 200: return "OK";
            case 201: return "Created";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 409: return "Conflict";
            case 413: return "Payload Too Large";
            case 415: return "Unsupported Media Type";
            case 422: return "Unprocessable Entity";
            case 429: return "Too Many Requests";
            case 500: return "Internal Server Error";
            case 502: return "Bad Gateway";
            case 503: return "Service Unavailable";
            case 504: return "Gateway Timeout";
            default: return "Status " + code;
        }
    }

    /** 서버 오류 응답과 같은 모양의 JSON 오류 ({ok:false, error, message}). proxyError 가 있으면 X-BN-Proxy-Error 헤더 */
    static Result error(int status, String code, String message, String proxyError, String detail) {
        String json = "{\"ok\":false,\"error\":\"" + jsonEscape(code) + "\",\"message\":\"" + jsonEscape(message) + "\"}";
        Map<String, String> h = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        h.put("Cache-Control", "no-store");
        h.put("X-BN-Proxy", "1");
        if (proxyError != null) h.put(ERROR_HEADER, proxyError);
        return new Result(status, reasonOf(status, null), "application/json", "utf-8", h, json.getBytes(UTF8), detail);
    }

    private static Result withDetail(Result r, String extra) {
        return new Result(r.status, r.reason, r.mime, r.charset, r.headers, r.body, r.detail + "; " + extra);
    }

    static String jsonEscape(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format(Locale.ROOT, "\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        return sb.toString();
    }
}
