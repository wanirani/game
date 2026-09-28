package com.bloodnocturne.game;

import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ApiProxy · WebViewCheck 를 호스트 JVM 에서 시험한다 (안드로이드 없이). tools/apk/verify_apk.mjs 가
 * android/.../ApiProxy.java, WebViewCheck.java 와 함께 컴파일해 로컬 API 서버(실제 netlify/functions/api.mts + 메모리 저장소)에 대고 실행한다.
 *
 *   java -cp <classes> com.bloodnocturne.game.ApiProxyCheck http://127.0.0.1:<port>
 *
 * 로컬 서버의 시험용 경로: /api/__echo (요청을 JSON 으로 되돌림, Set-Cookie·X-Echo 헤더), /api/__hang (응답 없음),
 * /api/__redirect (302), /api/__status?code=N (N 상태 + Retry-After).
 * 한 줄에 하나씩 "OK 이름" / "FAIL 이름 — 설명" 을 찍고, 실패가 있으면 종료 코드 1.
 */
public final class ApiProxyCheck {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static int fails;
    private static int passes;

    private ApiProxyCheck() {
    }

    private static void check(String name, boolean ok, String detail) {
        if (ok) passes++;
        else fails++;
        System.out.println((ok ? "OK " : "FAIL ") + name + (detail == null || detail.isEmpty() ? "" : " — " + detail));
    }

    private static String body(ApiProxy.Result r) {
        return new String(r.body, UTF8);
    }

    private static String desc(ApiProxy.Result r) {
        String b = body(r);
        return r.status + " " + r.mime + " " + (b.length() > 160 ? b.substring(0, 160) + "…" : b) + " [" + r.detail + "]";
    }

    public static void main(String[] args) throws Exception {
        String base = args.length > 0 ? args[0] : "http://127.0.0.1:8787";
        String ua = "Mozilla/5.0 (Linux; Android 14) Chrome/141.0 Mobile BloodNocturneApp/check";

        // ── 서버 주소 형식 ──
        check("origin: https 호스트", "https://blood-nocturne.netlify.app".equals(ApiProxy.parseOrigin("# 주석\n\n https://Blood-Nocturne.netlify.app/ \n", false)), null);
        check("origin: 포트 허용", "https://x.example:8443".equals(ApiProxy.parseOrigin("https://x.example:8443", false)), null);
        check("origin: 경로 거부", ApiProxy.parseOrigin("https://x.example/api", false) == null, null);
        check("origin: http 거부", ApiProxy.parseOrigin("http://x.example", false) == null, null);
        check("origin: http localhost 는 시험용으로만", ApiProxy.parseOrigin("http://127.0.0.1:9", false) == null && "http://127.0.0.1:9".equals(ApiProxy.parseOrigin("http://127.0.0.1:9", true)), null);
        check("origin: 빈 글 · 주석만", ApiProxy.parseOrigin("# a\n# b\n", false) == null && ApiProxy.parseOrigin(null, false) == null, null);
        check("origin: 이상한 호스트 거부", ApiProxy.parseOrigin("https://a..b", false) == null && ApiProxy.parseOrigin("https://-a.b", false) == null && ApiProxy.parseOrigin("https://a b", false) == null, null);

        // ── WebView 관문 ──
        check("webview: 120.0.6099.230 → 120", WebViewCheck.majorOf("120.0.6099.230") == 120, null);
        check("webview: 97 은 막고 98 은 통과", !WebViewCheck.ok(WebViewCheck.majorOf("97.0.4692.98")) && WebViewCheck.ok(WebViewCheck.majorOf("98.0.4758.101")), null);
        check("webview: UA 의 Chrome/141 → 141", WebViewCheck.chromeMajorFromUa("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36") == 141, null);
        check("webview: 알 수 없으면 막지 않음", WebViewCheck.ok(WebViewCheck.majorOf(null)) && WebViewCheck.ok(WebViewCheck.chromeMajorFromUa("Dalvik")), null);
        check("webview: Play 패키지", WebViewCheck.playPackage(null).equals("com.google.android.webview") && WebViewCheck.playPackage("com.android.chrome").equals("com.android.chrome") && WebViewCheck.playPackage("x;rm").equals("com.google.android.webview"), null);
        check("webview: 최소 버전 98", WebViewCheck.MIN_MAJOR == 98, null);
        check("webview: 엔진(UA) 버전 우선 — 화웨이 12.1.2.322 + Chrome/99 는 통과",
                WebViewCheck.ok(WebViewCheck.effectiveMajor(WebViewCheck.majorOf("12.1.2.322"), WebViewCheck.chromeMajorFromUa("Mozilla/5.0 (Linux; Android 10; wv) Chrome/99.0.4844.88 Mobile Safari/537.36")))
                && !WebViewCheck.ok(WebViewCheck.effectiveMajor(120, 97))
                && WebViewCheck.effectiveMajor(120, -1) == 120 && WebViewCheck.effectiveMajor(-1, -1) == -1, null);

        // ── 도우미 ──
        check("사유 문구: ASCII 만", ApiProxy.reasonOf(200, "확인 OK").equals("OK") && ApiProxy.reasonOf(429, null).equals("Too Many Requests") && ApiProxy.reasonOf(299, "").equals("Status 299"), null);
        ApiProxy.Result e = ApiProxy.error(504, "timeout", ApiProxy.MSG_TIMEOUT, "timeout", "t");
        check("JSON 오류 모양", body(e).equals("{\"ok\":false,\"error\":\"timeout\",\"message\":\"" + ApiProxy.MSG_TIMEOUT + "\"}") && "timeout".equals(e.header(ApiProxy.ERROR_HEADER)) && "no-store".equals(e.header("cache-control")), body(e));
        check("JSON 이스케이프", ApiProxy.jsonEscape("a\"b\\c\n\u0001").equals("a\\\"b\\\\c\\n\\u0001"), null);

        ApiProxy p = new ApiProxy(base, ua, 8000);

        // ── 맡기기 규칙 ──
        check("stash: 잘못된 id 거부", !p.stash("x", "POST", "", "{}") && !p.stash("../../etc", "POST", "", "{}") && !p.stash(null, "GET", null, null), null);
        check("stash: 잘못된 method 거부", !p.stash("abcdefgh1", "PO ST", "", null), null);
        StringBuilder big = new StringBuilder();
        while (big.length() <= ApiProxy.MAX_BODY_BYTES) big.append("0123456789abcdef");
        check("stash: 4MB 넘는 본문 거부", !p.stash("abcdefgh2", "POST", "", big.toString()), null);
        ApiProxy cap = new ApiProxy(base, ua, 8000);
        for (int i = 0; i < 40; i++) cap.stash("capcheck" + i, "GET", "", null);
        check("stash: 최대 32개 (오래된 것부터 버림)", cap.stashed() <= ApiProxy.MAX_STASH, "stashed=" + cap.stashed());
        List<String[]> hl = ApiProxy.parseHeaderLines("Content-Type: application/json\nbad line\nX-A: 1: 2\n: v\nAuth orization: x\r\nAuthorization: Bearer t");
        check("헤더 줄 해석", hl.size() == 3 && hl.get(1)[1].equals("1: 2") && hl.get(2)[0].equals("Authorization"), String.valueOf(hl.size()));
        check("전달하지 않는 요청 헤더", !ApiProxy.forwardableRequestHeader("Cookie") && !ApiProxy.forwardableRequestHeader("sec-fetch-site") && !ApiProxy.forwardableRequestHeader("X-Requested-With")
                && !ApiProxy.forwardableRequestHeader("Origin") && ApiProxy.forwardableRequestHeader("Authorization") && ApiProxy.forwardableRequestHeader("Content-Type"), null);

        // ── 전달: 건강 확인 (맡긴 것 없음) ──
        Map<String, String> pageHeaders = new HashMap<>();
        pageHeaders.put("Accept", "application/json");
        pageHeaders.put("X-Requested-With", "com.bloodnocturne.game");
        ApiProxy.Result r = p.forward("GET", "/api/health", pageHeaders);
        check("GET /api/health → 200 JSON", r.status == 200 && r.mime.equals("application/json") && "utf-8".equalsIgnoreCase(r.charset) && body(r).contains("\"ok\":true"), desc(r));
        check("응답: Cache-Control no-store · X-BN-Proxy", "no-store".equals(r.header("Cache-Control")) && "1".equals(r.header("x-bn-proxy")) && r.header("content-type") == null && r.header("content-length") == null, String.valueOf(r.headers));
        check("응답: 서버 보안 헤더 유지", "nosniff".equals(r.header("X-Content-Type-Options")), String.valueOf(r.headers));

        // ── 전달: 맡긴 본문·헤더 그대로 (에코) ──
        String k = "요청 본문 — 한글 ✓ \"quote\" \\ back";
        String json = "{\"k\":\"" + k.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}";
        check("stash 성공", p.stash("echo00001", "POST", "Content-Type: application/json\nAuthorization: Bearer abc.def\nCookie: s=1\nOrigin: https://appassets.androidplatform.net\nSec-Fetch-Site: same-origin\nX-Custom: 한글값", json), null);
        r = p.forward("POST", "/api/__echo?x=1&__bnreq=echo00001&y=%2F", pageHeaders);
        String eb = body(r);
        check("에코: 200", r.status == 200, desc(r));
        check("에코: method POST", eb.contains("\"method\":\"POST\""), eb);
        check("에코: 본문 바이트 그대로", eb.contains("\"body\":" + quote(json)), eb);
        check("에코: 쿼리 유지 · __bnreq 제거", eb.contains("\"query\":\"x=1&y=%2F\""), eb);
        check("에코: Authorization · Content-Type 전달", eb.contains("\"authorization\":\"Bearer abc.def\"") && eb.contains("\"content-type\":\"application/json\""), eb);
        check("에코: Cookie · Origin · Sec-Fetch · X-Requested-With 안 보냄", !eb.contains("\"cookie\"") && !eb.contains("\"origin\"") && !eb.contains("sec-fetch") && !eb.contains("x-requested-with"), eb);
        check("에코: User-Agent = WebView UA", eb.contains("BloodNocturneApp/check"), eb);
        check("에코: Content-Length = 본문 길이", eb.contains("\"content-length\":\"" + json.getBytes(UTF8).length + "\""), eb);
        check("에코: 응답 Set-Cookie 버림, 다른 헤더 유지", r.header("set-cookie") == null && "1".equals(r.header("x-echo")), String.valueOf(r.headers));
        check("에코: 맡긴 요청은 한 번 쓰면 지움", p.stashed() == 0, "stashed=" + p.stashed());

        // ── 실제 계정 API 흐름 (가입 → 내 정보 → 틀린 비밀번호) ──
        String id = "apk" + Long.toString(System.nanoTime() % 100000000L, 36);
        id = id.length() > 16 ? id.substring(0, 16) : id;
        String pw = "Crimson-Moon-7731";
        p.stash("signup0001", "POST", "Content-Type: application/json\nAccept: application/json", "{\"id\":\"" + id + "\",\"password\":\"" + pw + "\",\"remember\":true}");
        r = p.forward("POST", "/api/auth/signup?__bnreq=signup0001", pageHeaders);
        String sb = body(r);
        String token = between(sb, "\"token\":\"", "\"");
        check("가입 POST /api/auth/signup → 201 + 토큰", r.status == 201 && token != null && token.length() == 43, desc(r));
        Map<String, String> authHeaders = new HashMap<>();
        authHeaders.put("Authorization", "Bearer " + token);
        authHeaders.put("Accept", "application/json");
        r = p.forward("GET", "/api/auth/me", authHeaders);
        check("GET /api/auth/me (WebView 헤더) → 200", r.status == 200 && body(r).contains("\"id\":\"" + id + "\""), desc(r));
        p.stash("login00001", "POST", "Content-Type: application/json", "{\"id\":\"" + id + "\",\"password\":\"Wrong-Pass-99x\"}");
        r = p.forward("POST", "/api/auth/login?__bnreq=login00001", null);
        check("틀린 비밀번호 → 401 invalid_credentials (상태 그대로)", r.status == 401 && body(r).contains("invalid_credentials") && r.header(ApiProxy.ERROR_HEADER) == null, desc(r));
        p.stash("login00002", "POST", "Content-Type: application/json", "{\"id\":\"" + id + "\",\"password\":\"" + pw + "\"}");
        r = p.forward("POST", "/api/auth/login?__bnreq=login00002", null);
        check("로그인 → 200 + 토큰", r.status == 200 && body(r).contains("\"token\":\""), desc(r));
        r = p.forward("POST", "/api/auth/login?__bnreq=missing0001", null);
        check("맡긴 요청이 없는 POST 는 본문 없이 보내지 않고 network 오류", r.status == 502 && "network".equals(r.header(ApiProxy.ERROR_HEADER)) && r.detail.contains("stash"), desc(r));
        Map<String, String> logoutHeaders = new HashMap<>(authHeaders);
        r = p.forward("POST", "/api/auth/logout?__bnreq=missing0002", logoutHeaders);
        ApiProxy.Result me2 = p.forward("GET", "/api/auth/me", authHeaders);
        check("맡긴 요청이 없는 로그아웃은 서버에 닿지 않음 (세션 유지)", r.status == 502 && me2.status == 200, desc(r) + " / me " + me2.status);
        r = p.forward("GET", "/api/auth/me?__bnreq=missing0003", authHeaders);
        check("맡긴 요청이 없는 GET 은 WebView 헤더로 보냄", r.status == 200 && body(r).contains("\"id\":\"" + id + "\"") && r.detail.contains("stash"), desc(r));

        // ── 서버 상태 · 넘겨주기 · 방식 ──
        r = p.forward("GET", "/api/__status?code=429", null);
        check("429 + Retry-After 그대로", r.status == 429 && "7".equals(r.header("Retry-After")), desc(r) + " " + r.headers);
        r = p.forward("GET", "/api/__redirect", null);
        check("3xx 는 따라가지 않고 network 오류", r.status == 502 && "network".equals(r.header(ApiProxy.ERROR_HEADER)), desc(r));
        r = p.forward("GET", "/index.html", null);
        check("/api 밖 경로 → 404", r.status == 404, desc(r));
        r = p.forward("GET", "/api/%2E%2E/index.html", null);
        ApiProxy.Result r2 = p.forward("GET", "/api/x%2f..%2f..%2findex.html", null);
        check("인코딩된 점·슬래시로 /api 밖으로 → 404 (서버로 보내지 않음)", r.status == 404 && r2.status == 404 && r.detail.contains("encoded") && r2.detail.contains("encoded"), desc(r) + " / " + desc(r2));
        r = p.forward("PATCH", "/api/__echo", null);
        check("PATCH (HttpURLConnection 미지원) → 405 JSON", r.status == 405 && body(r).contains("method_not_allowed"), desc(r));
        r = p.forward("DELETE", "/api/__echo", null);
        check("DELETE 본문 없이", r.status == 200 && body(r).contains("\"method\":\"DELETE\""), desc(r));
        r = p.forward("HEAD", "/api/__echo", null);
        check("HEAD → 본문 없음", r.status == 200 && r.body.length == 0, desc(r));

        // ── 시간 초과 · 연결 실패 · 꺼짐 ──
        ApiProxy slow = new ApiProxy(base, ua, 1200);
        long t0 = System.currentTimeMillis();
        r = slow.forward("GET", "/api/__hang", null);
        long dt = System.currentTimeMillis() - t0;
        check("응답 없음 → 504 timeout JSON (제한 시간 안에)", r.status == 504 && "timeout".equals(r.header(ApiProxy.ERROR_HEADER)) && body(r).contains("\"error\":\"timeout\"") && dt < 4000, desc(r) + " " + dt + "ms");
        check("기본 제한 시간 15초", ApiProxy.TIMEOUT_MS == 15000, null);
        ApiProxy down = new ApiProxy("http://127.0.0.1:1", ua, 3000);
        r = down.forward("GET", "/api/health", null);
        check("연결 실패 → 502 network JSON", r.status == 502 && "network".equals(r.header(ApiProxy.ERROR_HEADER)) && body(r).contains(ApiProxy.MSG_NETWORK), desc(r));
        ApiProxy off = new ApiProxy(null, ua, 3000);
        r = off.forward("GET", "/api/health", null);
        check("서버 주소 없음 → 503 unavailable", r.status == 503 && "unavailable".equals(r.header(ApiProxy.ERROR_HEADER)), desc(r));

        System.out.println("SUMMARY " + passes + " " + fails);
        System.exit(fails == 0 ? 0 : 1);
    }

    private static String quote(String s) {
        return "\"" + ApiProxy.jsonEscape(s) + "\"";
    }

    private static String between(String s, String a, String b) {
        int i = s.indexOf(a);
        if (i < 0) return null;
        int j = s.indexOf(b, i + a.length());
        return j < 0 ? null : s.substring(i + a.length(), j);
    }

    @SuppressWarnings("unused")
    private static List<String> list(String... xs) {
        List<String> out = new ArrayList<>();
        for (String x : xs) out.add(x);
        return out;
    }
}
