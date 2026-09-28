package com.bloodnocturne.game;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 가상 https 출처(https://appassets.androidplatform.net/...)를 APK 의 assets/www/... 파일로 연결한다.
 *
 * - file:// 대신 https 출처를 쓰므로 ES 모듈, localStorage(세이브), 폰트, fetch 가 일반 웹과 똑같이 동작한다.
 * - appassets.androidplatform.net 은 안드로이드가 이 용도로 예약해 둔 도메인이라 실제 네트워크로 나가지 않는다.
 * - assets/www 는 웹 배포 빌드(dist/web, tools/deploy/build_web.mjs)와 같은 파일이다 (sw.js·downloads/·_redirects 제외).
 * - 쿼리 문자열(?v=2 등)은 무시하고, 없는 파일은 404 를 돌려준다 (게임은 이미지 404 시 절차적 그림으로 대체).
 * - 휴대폰 밀도 APK(apk.json assets="lo")에는 bg/·cg/·portraits/ 원본 대신 assets/lo/ 사본만 들어 있다:
 *   원본 경로로 요청이 오면 lo/ 사본을 준다 (assets.js 가 어떤 변형을 고르든 그림이 빠지지 않게).
 * - /api/* 는 ApiProxy 가 계정 서버(apk.json api.origin = tools/apk/api_origin.txt)로 대신 보낸다 (docs/ACCOUNTS.md §1).
 * - index.html 에는 assets/app/head_inject.html 조각을 </head> 앞에 끼워 넣는다 ({{VERSION}}, {{CONFIG}} = apk.json 을 채워서).
 *
 * MIME 표는 tools/apk/verify_apk.mjs 가 이 파일에서 그대로 읽어 헤드리스 검증에 쓴다
 * (형식 `MIME.put("확장자", "타입");` 을 유지할 것).
 */
final class AssetServer {
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST;
    static final String START_URL = ORIGIN + "/index.html";
    /** 빌드가 넣는 앱 설정 (tools/apk/build_apk.sh → pack_web.py): {api:{origin,aliases}, assets:'full'|'lo'|'lo+td', web:{…}} */
    static final String CONFIG_ASSET = "app/apk.json";

    private static final String TAG = "BloodNocturne";
    private static final String WWW = "www";
    private static final String INJECT_ASSET = "app/head_inject.html";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    /** 휴대폰 밀도 APK 에서 원본이 빠지는 폴더 (tools/assets/make_variants.py 의 lo/ 대상과 같다) */
    private static final java.util.regex.Pattern LO_TWIN = java.util.regex.Pattern.compile("^assets/((?:bg|cg|portraits)/.+\\.webp)$");

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("htm", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("map", "application/json");
        MIME.put("txt", "text/plain");
        MIME.put("xml", "application/xml");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("webp", "image/webp");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("gif", "image/gif");
        MIME.put("avif", "image/avif");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff2", "font/woff2");
        MIME.put("woff", "font/woff");
        MIME.put("ttf", "font/ttf");
        MIME.put("otf", "font/otf");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("oga", "audio/ogg");
        MIME.put("opus", "audio/ogg");
        MIME.put("wav", "audio/wav");
        MIME.put("m4a", "audio/mp4");
        MIME.put("aac", "audio/aac");
        MIME.put("flac", "audio/flac");
        MIME.put("mp4", "video/mp4");
        MIME.put("webm", "video/webm");
        MIME.put("wasm", "application/wasm");
    }

    private final AssetManager am;
    private final String version;
    private final String configJson;
    private final ApiProxy api;
    private volatile String injectCache;

    /** configJson: assets/app/apk.json 내용 (없으면 "{}"), api: /api 프록시 (null 이면 /api/* 는 503 JSON) */
    AssetServer(AssetManager am, String version, String configJson, ApiProxy api) {
        this.am = am;
        this.version = version == null ? "" : version;
        this.configJson = configJson == null || configJson.trim().isEmpty() ? "{}" : configJson.trim();
        this.api = api;
    }

    /** APK 에셋 텍스트 파일 (없으면 null) */
    static String readAssetText(AssetManager am, String path) {
        try {
            return new String(readAll(am.open(path, AssetManager.ACCESS_BUFFER)), UTF8);
        } catch (IOException e) {
            return null;
        }
    }

    static boolean isLocal(Uri u) {
        return u != null && "https".equalsIgnoreCase(u.getScheme()) && HOST.equalsIgnoreCase(u.getHost());
    }

    static String mimeOf(String path) {
        int slash = path.lastIndexOf('/');
        int dot = path.lastIndexOf('.');
        if (dot <= slash) return "application/octet-stream";
        String m = MIME.get(path.substring(dot + 1).toLowerCase(Locale.ROOT));
        return m != null ? m : "application/octet-stream";
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml") || mime.equals("image/svg+xml");
    }

    private static boolean isMedia(String mime) {
        return mime.startsWith("audio/") || mime.startsWith("video/");
    }

    /** "/a/b/../c.png" 같은 경로를 정규화한다. 루트 밖으로 나가면 null */
    static String normalize(String path) {
        List<String> out = new ArrayList<>();
        for (String seg : path.split("/")) {
            if (seg.isEmpty() || seg.equals(".")) continue;
            if (seg.equals("..")) {
                if (out.isEmpty()) return null;
                out.remove(out.size() - 1);
                continue;
            }
            if (seg.indexOf('\\') >= 0 || seg.indexOf('\0') >= 0) return null;
            out.add(seg);
        }
        StringBuilder sb = new StringBuilder();
        for (String s : out) {
            if (sb.length() > 0) sb.append('/');
            sb.append(s);
        }
        return sb.toString();
    }

    /** WebViewClient / ServiceWorkerClient 공용 진입점. 우리 출처가 아니면 null (WebView 기본 처리) */
    WebResourceResponse serve(WebResourceRequest req) {
        if (req == null) return null;
        Uri u = req.getUrl();
        if (!isLocal(u)) return null;
        String method = req.getMethod() == null ? "GET" : req.getMethod().toUpperCase(Locale.ROOT);
        // 계정 API: 파일이 아니라 서버로 대신 보낸다 (퍼센트 인코딩·쿼리는 그대로)
        String encoded = u.getEncodedPath();
        String apiRel = encoded == null ? null : normalize(encoded);
        if (apiRel != null && (apiRel.equals("api") || apiRel.startsWith("api/"))) return proxy(req, method, "/" + apiRel, u.getEncodedQuery());

        String path = u.getPath();
        if (path == null || path.isEmpty()) path = "/";
        if (path.endsWith("/")) path = path + "index.html";
        String rel = normalize(path);
        if (rel == null || rel.isEmpty()) return status(403, "Forbidden");

        Map<String, String> headers = baseHeaders();
        if (method.equals("OPTIONS")) {
            headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
            headers.put("Access-Control-Allow-Headers", "*");
            return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", headers, new ByteArrayInputStream(new byte[0]));
        }
        if (!method.equals("GET") && !method.equals("HEAD")) return status(405, "Method Not Allowed");

        try {
            return file(req, method, rel, WWW + "/" + rel, headers);
        } catch (FileNotFoundException e) {
            // 휴대폰 밀도 APK: 원본이 빠진 배경·CG·초상화는 lo/ 사본으로
            java.util.regex.Matcher lo = LO_TWIN.matcher(rel);
            if (lo.matches()) {
                try {
                    return file(req, method, rel, WWW + "/assets/lo/" + lo.group(1), baseHeaders());
                } catch (FileNotFoundException e2) {
                    return status(404, "Not Found");
                } catch (IOException e2) {
                    Log.w(TAG, "asset read failed: " + rel + " (lo)", e2);
                    return status(500, "Internal Server Error");
                }
            }
            return status(404, "Not Found");
        } catch (IOException e) {
            Log.w(TAG, "asset read failed: " + rel, e);
            return status(500, "Internal Server Error");
        }
    }

    /** rel(요청 경로)의 MIME 으로 asset(APK 안 실제 경로)을 준다. 없으면 FileNotFoundException */
    private WebResourceResponse file(WebResourceRequest req, String method, String rel, String asset, Map<String, String> headers) throws IOException {
        String mime = mimeOf(rel);
        String enc = isText(mime) ? "utf-8" : null;
        if (rel.equals("index.html")) {
            byte[] html = injectIndex(readAll(am.open(asset, AssetManager.ACCESS_BUFFER)));
            headers.put("Content-Length", String.valueOf(html.length));
            return new WebResourceResponse(mime, enc, 200, "OK", headers,
                    new ByteArrayInputStream(method.equals("HEAD") ? new byte[0] : html));
        }
        if (isMedia(mime)) {
            WebResourceResponse partial = rangeResponse(asset, mime, header(req, "Range"), headers);
            if (partial != null) return partial;
        }
        long len = isText(mime) ? -1 : assetLength(asset); // 텍스트는 압축 저장이라 길이를 미리 알 수 없다
        if (len >= 0) headers.put("Content-Length", String.valueOf(len));
        InputStream in = method.equals("HEAD")
                ? new ByteArrayInputStream(new byte[0])
                : am.open(asset, AssetManager.ACCESS_STREAMING);
        if (method.equals("HEAD")) am.open(asset).close(); // 존재 확인
        return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
    }

    /** /api/* → ApiProxy (응답은 언제나 JSON 또는 서버 응답 그대로; 이 스레드는 WebView 의 요청 처리 스레드라 막아도 된다) */
    private WebResourceResponse proxy(WebResourceRequest req, String method, String path, String query) {
        ApiProxy.Result r = api != null
                ? api.forward(method, path + (query != null ? "?" + query : ""), req.getRequestHeaders())
                : ApiProxy.error(503, "unavailable", ApiProxy.MSG_UNAVAILABLE, "unavailable", "proxy disabled");
        if (r.status >= 500 || r.header(ApiProxy.ERROR_HEADER) != null || (r.detail != null && r.detail.contains("stash"))) {
            Log.w(TAG, "api proxy " + method + " " + path + " → " + r.status + " (" + r.detail + ")");
        }
        try {
            return new WebResourceResponse(r.mime, r.charset, r.status, r.reason, r.headers, new ByteArrayInputStream(r.body));
        } catch (IllegalArgumentException e) {
            ApiProxy.Result x = ApiProxy.error(502, "network", ApiProxy.MSG_NETWORK, "network", String.valueOf(e));
            return new WebResourceResponse(x.mime, x.charset, x.status, x.reason, x.headers, new ByteArrayInputStream(x.body));
        }
    }

    private Map<String, String> baseHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cross-Origin-Resource-Policy", "cross-origin");
        return h;
    }

    private WebResourceResponse status(int code, String reason) {
        byte[] body = (code + " " + reason).getBytes(UTF8);
        return new WebResourceResponse("text/plain", "utf-8", code, reason, baseHeaders(), new ByteArrayInputStream(body));
    }

    private static String header(WebResourceRequest req, String name) {
        Map<String, String> h = req.getRequestHeaders();
        if (h == null) return null;
        for (Map.Entry<String, String> e : h.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        }
        return null;
    }

    /** 압축하지 않고 저장된 에셋(이미지·오디오)은 openFd 로 길이를 알 수 있다. 압축된 텍스트는 -1 */
    private long assetLength(String asset) {
        try {
            AssetFileDescriptor fd = am.openFd(asset);
            long len = fd.getLength();
            fd.close();
            return len;
        } catch (IOException e) {
            return -1;
        }
    }

    /** 오디오/비디오 요소의 Range 요청 (bytes=a-b) 처리. 해당 없으면 null */
    private WebResourceResponse rangeResponse(String asset, String mime, String range, Map<String, String> headers) throws IOException {
        headers.put("Accept-Ranges", "bytes");
        if (range == null || !range.startsWith("bytes=")) return null;
        long total = assetLength(asset);
        if (total <= 0) return null;
        String spec = range.substring(6).trim();
        int comma = spec.indexOf(',');
        if (comma >= 0) spec = spec.substring(0, comma).trim();
        int dash = spec.indexOf('-');
        if (dash < 0) return null;
        long start, end;
        try {
            String a = spec.substring(0, dash).trim(), b = spec.substring(dash + 1).trim();
            if (a.isEmpty()) { // 끝에서 n 바이트
                long n = Long.parseLong(b);
                start = Math.max(0, total - n);
                end = total - 1;
            } else {
                start = Long.parseLong(a);
                end = b.isEmpty() ? total - 1 : Math.min(Long.parseLong(b), total - 1);
            }
        } catch (NumberFormatException e) {
            return null;
        }
        if (start >= total || start > end) {
            Map<String, String> h = baseHeaders();
            h.put("Content-Range", "bytes */" + total);
            return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, new ByteArrayInputStream(new byte[0]));
        }
        InputStream in = am.open(asset, AssetManager.ACCESS_RANDOM);
        long skipped = 0;
        while (skipped < start) {
            long s = in.skip(start - skipped);
            if (s <= 0) break;
            skipped += s;
        }
        long len = end - start + 1;
        headers.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
        headers.put("Content-Length", String.valueOf(len));
        return new WebResourceResponse(mime, null, 206, "Partial Content", headers, new LimitedStream(in, len));
    }

    private byte[] injectIndex(byte[] html) {
        String inject = injectCache;
        if (inject == null) {
            try {
                inject = new String(readAll(am.open(INJECT_ASSET)), UTF8)
                        .replace("{{VERSION}}", version.replaceAll("[^0-9A-Za-z._+-]", ""))
                        .replace("{{CONFIG}}", configJson.replace("</", "<\\/"));
            } catch (IOException e) {
                inject = "";
            }
            injectCache = inject;
        }
        if (inject.isEmpty()) return html;
        String s = new String(html, UTF8);
        int at = s.toLowerCase(Locale.ROOT).indexOf("</head>");
        if (at < 0) return html;
        return (s.substring(0, at) + inject + s.substring(at)).getBytes(UTF8);
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(Math.max(1024, in.available()));
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        } finally {
            in.close();
        }
    }

    /** 앞에서부터 len 바이트만 읽게 하는 스트림 */
    private static final class LimitedStream extends FilterInputStream {
        private long left;

        LimitedStream(InputStream in, long len) {
            super(in);
            left = len;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = super.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = super.read(b, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }

        @Override
        public long skip(long n) throws IOException {
            long s = super.skip(Math.min(n, left));
            if (s > 0) left -= s;
            return s;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), left);
        }
    }
}
