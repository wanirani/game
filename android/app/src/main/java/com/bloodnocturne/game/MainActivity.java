package com.bloodnocturne.game;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CombinedVibration;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.util.TypedValue;
import android.view.DisplayCutout;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.Locale;

/**
 * 블러드 녹턴 안드로이드 앱: 가로 몰입형 전체화면 WebView 한 장.
 *
 * - 게임(dist/web: index.html, build-info.js, css/, src/, assets/)은 APK assets/www 에 들어 있고 AssetServer 가
 *   https://appassets.androidplatform.net/ 가상 출처로 제공한다 (오프라인 동작, localStorage 세이브 유지).
 * - WebView 관문: Android System WebView 가 98 보다 낮으면 검은 화면 대신 업데이트 안내(Play 스토어)를 띄운다 (platform §9.4-1).
 * - 안전 영역: WindowInsets(디스플레이 컷아웃·시스템 바)를 CSS px 로 바꿔 window.__BN_INSETS 와 'bn-insets' 이벤트로 알린다 (§9.4-2).
 *   화면 키보드(IME)가 가린 높이는 window.__BN_IME = {bottom} (API 30+, 계정 화면 입력 칸이 키보드를 피한다).
 * - 게임패드: WebView(Chromium)가 Gamepad API 로 넘겨준다. 액티비티는 게임패드 키를 가로채지 않으며,
 *   처리되지 않은 B 버튼이 시스템 '뒤로'로 바뀌지 않도록 게임패드 이벤트는 소비 처리한다.
 *   진동: BNAndroid.rumble(strong, weak, ms) → 연결된 컨트롤러의 진동 모터 (API 31+ VibratorManager, 그 아래는 단일 모터).
 * - 뒤로 버튼: 게임에 Escape 키(메뉴/취소)를 보낸다. 타이틀 화면에서는 종료 확인 창을 띄운다.
 * - /api/* 는 AssetServer → ApiProxy 가 계정 서버로 대신 보낸다 (본문은 BNAndroid.apiStash 로 먼저 받는다).
 * - 새 버전 확인: 계정 서버와 같은 사이트의 downloads/latest.json 을 하루 두 번까지 확인해 타이틀 화면에서 알린다.
 */
public class MainActivity extends Activity {
    private static final String TAG = "BloodNocturne";
    private static final int BG = 0xFF050207;
    private static final int GOLD = 0xFFE8C872;
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String PREFS = "bn_app";
    private static final long UPDATE_EVERY_MS = 12L * 3600 * 1000;

    /** 뒤로 버튼을 눌렀을 때 게임 상태를 묻는 스크립트: 'exit' 이면 종료 확인, 'esc' 면 Escape 전달 */
    private static final String BACK_PROBE_JS =
            "(function(){try{var g=window.__game;if(!g||!g.scenes||!g.scenes.length)return 'exit';"
            + "var t=g.scenes[g.scenes.length-1];"
            + "if(g.scenes.length===1&&t&&t.name==='title'&&t.mode!=='menu')return 'exit';"
            + "return 'esc';}catch(e){return 'exit';}})()";

    /** 게임 입력(src/core/input.js)은 window 의 keydown/keyup 의 e.code 를 읽는다. 한 프레임 이상 눌린 상태를 유지한다 */
    private static final String ESCAPE_JS =
            "(function(){try{var o={key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true};"
            + "var t=document.activeElement||document.body||document;"
            + "t.dispatchEvent(new KeyboardEvent('keydown',o));"
            + "setTimeout(function(){t.dispatchEvent(new KeyboardEvent('keyup',o));},120);}catch(e){}})()";

    /** 안전 영역 알림 (%s = {"l","r","t","b"} CSS px). src/core/platform.js 가 env(safe-area-inset-*) 와 칸별 최댓값을 쓴다 */
    private static final String INSETS_JS =
            "(function(v){try{window.__BN_INSETS=v;window.dispatchEvent(new Event('bn-insets'));}catch(e){}})(%s)";

    /** 화면 키보드 알림 (%s = {"bottom"} CSS px, 0 = 닫힘). src/scenes/front/account.js 가 매 프레임 읽는다 */
    private static final String IME_JS =
            "(function(v){try{window.__BN_IME=v;window.dispatchEvent(new Event('bn-ime'));}catch(e){}})(%s)";

    private FrameLayout root;
    private WebView web;
    private AssetServer server;
    private volatile ApiProxy api;
    private String configText = "{}";
    private String apiOrigin;
    private boolean lite;
    private String startUrl = AssetServer.START_URL;
    private AlertDialog exitDialog;
    private AlertDialog updateDialog;
    private boolean backPending;
    private boolean gateShown;
    /** 버전이 낮아서 막은 경우만 (돌아왔을 때 다시 확인해 자동 시작). WebView 생성 실패로 띄운 안내는 다시 시도하지 않는다 (재생성 반복 방지) */
    private boolean gateOld;
    private volatile String insetsJson;
    private volatile String imeJson;
    private boolean imeOpen;
    private volatile int lastPadId = -1;
    private int rumbleDevId = -1;
    private int rumbleFor = -2;
    private long rumbleDevAt;
    private long rumbleErrAt;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        if (Build.VERSION.SDK_INT >= 30) w.setDecorFitsSystemWindows(false);
        w.getDecorView().setBackgroundColor(BG);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        loadConfig();
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        setContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        installInsetsListener();

        // WebView 관문: 없거나 98 미만이면 안내 화면 (게임 대신)
        WvInfo info = webViewInfo();
        if (info == null) {
            showWebViewProblem(null);
        } else if (!WebViewCheck.ok(info.major)) {
            Log.w(TAG, "WebView too old: " + info.pkg + " " + info.version);
            showWebViewProblem(info);
        } else {
            startGame();
        }
        hideSystemUi();
    }

    /** assets/app/apk.json (빌드가 넣는 설정): 계정 서버 주소, 휴대폰 밀도 여부 */
    private void loadConfig() {
        String txt = AssetServer.readAssetText(getAssets(), AssetServer.CONFIG_ASSET);
        JSONObject c;
        try {
            c = txt == null ? new JSONObject() : new JSONObject(txt);
        } catch (Exception e) {
            Log.w(TAG, "bad " + AssetServer.CONFIG_ASSET, e);
            c = new JSONObject();
        }
        configText = c.toString();
        JSONObject a = c.optJSONObject("api");
        apiOrigin = a == null ? null : ApiProxy.parseOrigin(a.optString("origin", ""), false);
        lite = c.optString("assets", "full").startsWith("lo");
        startUrl = AssetServer.START_URL + (lite ? "?lo=1" : ""); // assets.js: lo/ 변형만 쓴다 (원본은 APK 에 없음)
    }

    private void startGame() {
        gateShown = false;
        gateOld = false;
        String ua;
        try {
            ua = WebSettings.getDefaultUserAgent(this) + " BloodNocturneApp/" + versionName();
        } catch (Throwable t) {
            ua = "BloodNocturneApp/" + versionName();
        }
        api = apiOrigin == null ? null : new ApiProxy(apiOrigin, ua, ApiProxy.TIMEOUT_MS);
        server = new AssetServer(getAssets(), versionName(), configText, api);
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                ServiceWorkerController.getInstance().setServiceWorkerClient(new SwClient(server));
            } catch (Throwable t) {
                Log.w(TAG, "service worker client unavailable", t);
            }
        }
        if (!createWebView()) return;
        web.loadUrl(startUrl);
        hideSystemUi();
        checkForUpdate();
    }

    /** WebView 생성 (렌더러가 죽었을 때 재생성에도 사용). WebView 가 없는 기기면 안내문 표시 */
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private boolean createWebView() {
        try {
            web = new WebView(this);
        } catch (Throwable t) {
            Log.e(TAG, "WebView unavailable", t);
            web = null;
            showWebViewProblem(null);
            return false;
        }
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setKeepScreenOn(true);
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true); // 길게 눌러 텍스트 선택/컨텍스트 메뉴가 뜨지 않게
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100); // 시스템 글꼴 크기 설정이 게임 UI 를 깨지 않도록
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setOffscreenPreRaster(true);
        s.setUserAgentString(s.getUserAgentString() + " BloodNocturneApp/" + versionName());

        web.addJavascriptInterface(new Bridge(this), "BNAndroid");
        web.setWebViewClient(new Client(this));
        web.setWebChromeClient(new Chrome());
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web.requestFocus();
        return true;
    }

    private String versionName() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName == null ? "" : pi.versionName;
        } catch (Exception e) {
            return "";
        }
    }

    @SuppressWarnings("deprecation")
    private long versionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    // ───────────────────────── WebView 관문 (platform §9.4-1) ─────────────────────────

    private static final class WvInfo {
        final String pkg;
        final String version;
        final int major;

        WvInfo(String pkg, String version, int major) {
            this.pkg = pkg;
            this.version = version;
            this.major = major;
        }
    }

    /**
     * 지금 쓰이는 WebView 제공자와 버전. WebView 가 없거나 꺼져 있으면 null.
     * 제공 패키지(getCurrentWebViewPackage, API 26+)의 versionName 과 기본 User-Agent 의 Chrome/NN 을 함께 읽고,
     * 판단은 엔진 버전(UA)을 우선한다 (WebViewCheck.effectiveMajor — versionName 이 Chromium 번호가 아닌 제공자 대비).
     */
    private WvInfo webViewInfo() {
        String pkg = null, ver = null;
        int pkgMajor = -1;
        boolean provider = false;
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                PackageInfo p = WebView.getCurrentWebViewPackage();
                if (p != null) {
                    pkg = p.packageName;
                    ver = p.versionName;
                    pkgMajor = WebViewCheck.majorOf(ver);
                    provider = true;
                }
            } catch (Throwable t) {
                Log.w(TAG, "getCurrentWebViewPackage failed", t);
            }
        }
        int uaMajor = -1;
        try {
            uaMajor = WebViewCheck.chromeMajorFromUa(WebSettings.getDefaultUserAgent(this)); // WebView 제공자를 불러온다: 없으면 예외
            provider = true;
        } catch (Throwable t) {
            if (!provider) {
                Log.e(TAG, "no WebView provider", t);
                return null;
            }
            Log.w(TAG, "default user agent unavailable", t);
        }
        int major = WebViewCheck.effectiveMajor(pkgMajor, uaMajor);
        String shown = ver != null && major == pkgMajor ? ver : major > 0 ? String.valueOf(major) : ver != null ? ver : "?";
        return new WvInfo(pkg, shown, major);
    }

    /** info == null: WebView 없음. 아니면 버전이 낮음 → 업데이트 안내 + Play 스토어 버튼 (+ 그래도 실행) */
    private void showWebViewProblem(WvInfo info) {
        gateShown = true;
        gateOld = info != null;
        root.removeAllViews();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        int pad = dp(32);
        box.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText(info == null ? getString(R.string.no_webview) : getString(R.string.webview_update));
        title.setTextColor(GOLD);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, info == null ? 17 : 22);
        title.setGravity(Gravity.CENTER);
        box.addView(title, wrap());
        if (info != null) {
            TextView detail = new TextView(this);
            detail.setText(getString(R.string.webview_update_detail, info.version == null ? "?" : info.version, WebViewCheck.MIN_MAJOR));
            detail.setTextColor(Color.rgb(200, 184, 160));
            detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            detail.setGravity(Gravity.CENTER);
            detail.setPadding(0, dp(12), 0, dp(8));
            box.addView(detail, wrap());
        }
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.setPadding(0, dp(16), 0, 0);
        Button play = new Button(this);
        play.setText(R.string.webview_open_play);
        final String pkg = info == null ? null : info.pkg;
        play.setOnClickListener(v -> openPlayStore(pkg));
        row.addView(play, wrap());
        if (info != null) {
            Button go = new Button(this);
            go.setText(R.string.webview_run_anyway);
            go.setOnClickListener(v -> {
                root.removeAllViews();
                startGame();
            });
            LinearLayout.LayoutParams lp = wrap();
            lp.leftMargin = dp(16);
            row.addView(go, lp);
        }
        box.addView(row, wrap());
        root.addView(box, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        play.requestFocus(); // 게임패드·리모컨으로도 누를 수 있게
    }

    private LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void openPlayStore(String providerPackage) {
        String p = WebViewCheck.playPackage(providerPackage);
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + p)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            openBrowser("https://play.google.com/store/apps/details?id=" + p);
        }
    }

    private void openBrowser(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    // ───────────────────────── 안전 영역 · 화면 키보드 (platform §9.4-2) ─────────────────────────

    private void installInsetsListener() {
        root.setOnApplyWindowInsetsListener((v, wi) -> {
            onInsets(wi);
            return v.onApplyWindowInsets(wi);
        });
        root.requestApplyInsets();
    }

    /** WindowInsets → CSS px (px / density). 몰입형이라 시스템 바는 보통 0 이고, 컷아웃(노치·펀치홀)이 남는다 */
    private void onInsets(WindowInsets wi) {
        if (wi == null) return;
        int l = 0, t = 0, r = 0, b = 0, ime = -1;
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars = wi.getInsets(WindowInsets.Type.systemBars());
            android.graphics.Insets cut = wi.getInsets(WindowInsets.Type.displayCutout());
            l = Math.max(bars.left, cut.left);
            t = Math.max(bars.top, cut.top);
            r = Math.max(bars.right, cut.right);
            b = Math.max(bars.bottom, cut.bottom);
            ime = wi.getInsets(WindowInsets.Type.ime()).bottom;
        } else if (Build.VERSION.SDK_INT >= 28) {
            // API 28~29: 몰입형(LAYOUT_STABLE)의 시스템 창 여백은 숨겨진 바까지 포함하므로 쓰지 않는다 — 컷아웃만
            DisplayCutout dc = wi.getDisplayCutout();
            if (dc != null) {
                l = dc.getSafeInsetLeft();
                t = dc.getSafeInsetTop();
                r = dc.getSafeInsetRight();
                b = dc.getSafeInsetBottom();
            }
        }
        float d = getResources().getDisplayMetrics().density;
        boolean open = ime > 0;
        // 키보드가 떠 있는 동안 튀어나온 내비게이션 바로 게임 화면이 움직이지 않게 안전 영역은 그대로 둔다
        if (!open || insetsJson == null) {
            publishInsets("{\"l\":" + css(l, d) + ",\"r\":" + css(r, d) + ",\"t\":" + css(t, d) + ",\"b\":" + css(b, d) + "}");
        }
        if (ime >= 0) {
            publishIme("{\"bottom\":" + (open ? css(ime, d) : "0") + "}");
            if (imeOpen && !open) ui.postDelayed(this::hideSystemUi, 250); // 키보드가 닫히면 몰입형 복귀
            imeOpen = open;
        }
    }

    private static String css(int px, float density) {
        if (px <= 0 || density <= 0) return "0";
        return String.valueOf(Math.round(px / density * 10f) / 10f);
    }

    private void publishInsets(String json) {
        if (json.equals(insetsJson)) return;
        insetsJson = json;
        if (web != null) web.evaluateJavascript(String.format(Locale.ROOT, INSETS_JS, json), null);
    }

    private void publishIme(String json) {
        if (json.equals(imeJson)) return;
        imeJson = json;
        if (web != null) web.evaluateJavascript(String.format(Locale.ROOT, IME_JS, json), null);
    }

    // ───────────────────────── 몰입형 전체화면 ─────────────────────────

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
            if (web != null && !web.hasFocus()) web.requestFocus();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig); // 게임패드 연결/회전으로 액티비티가 다시 만들어지지 않게 manifest configChanges 로 받는다
        hideSystemUi();
    }

    // ───────────────────────── 입력 (뒤로 버튼 · 게임패드) ─────────────────────────

    private static boolean isGamepadEvent(KeyEvent e) {
        int src = e.getSource();
        return KeyEvent.isGamepadButton(e.getKeyCode())
                || (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int kc = e.getKeyCode();
        if (kc == KeyEvent.KEYCODE_BACK) {
            // 휴대폰 뒤로 버튼/제스처(및 일부 패드의 BACK): 게임 메뉴/취소(Escape) 또는 타이틀에서 종료 확인
            if (e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) onGameBack();
            return true;
        }
        if (isGamepadEvent(e)) lastPadId = e.getDeviceId();
        if (web != null && isGamepadEvent(e)) {
            // WebView 로 그대로 보내고(→ Gamepad API), 처리 여부와 상관없이 소비해 시스템이 B 버튼을 '뒤로'로 바꾸지 않게 한다
            if (!web.hasFocus()) web.requestFocus();
            super.dispatchKeyEvent(e);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        int src = e.getSource();
        if ((src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK || (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) {
            lastPadId = e.getDeviceId(); // 진동을 보낼 컨트롤러
        }
        return super.dispatchGenericMotionEvent(e);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        onGameBack(); // dispatchKeyEvent 를 거치지 않는 뒤로 제스처 대비
    }

    private void onGameBack() {
        if (web == null) {
            finish();
            return;
        }
        if (exitDialog != null && exitDialog.isShowing()) return;
        if (backPending) return;
        backPending = true;
        ui.postDelayed(() -> backPending = false, 1500); // 스크립트 응답이 오지 않는 경우 대비
        web.evaluateJavascript(BACK_PROBE_JS, value -> {
            backPending = false;
            if (value != null && value.contains("esc")) {
                if (web != null) web.evaluateJavascript(ESCAPE_JS, null);
            } else {
                confirmExit();
            }
        });
    }

    private void confirmExit() {
        if (isFinishing() || (exitDialog != null && exitDialog.isShowing())) return;
        exitDialog = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(R.string.exit_title)
                .setMessage(R.string.exit_message)
                .setPositiveButton(R.string.exit_ok, (d, which) -> finishApp())
                .setNegativeButton(R.string.exit_cancel, null)
                .setOnDismissListener(d -> {
                    hideSystemUi();
                    if (web != null) web.requestFocus();
                })
                .create();
        showImmersive(exitDialog);
    }

    /** 대화상자가 뜰 때 시스템 바가 튀어나오지 않도록 잠시 포커스를 받지 않게 띄운 뒤 되돌린다 */
    @SuppressWarnings("deprecation")
    private void showImmersive(AlertDialog dlg) {
        Window dw = dlg.getWindow();
        if (dw != null) dw.setFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        dlg.show();
        if (dw != null) {
            if (Build.VERSION.SDK_INT < 30) {
                dw.getDecorView().setSystemUiVisibility(getWindow().getDecorView().getSystemUiVisibility());
            } else {
                WindowInsetsController c = dw.getInsetsController();
                if (c != null) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            }
            dw.clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        }
    }

    private void finishApp() {
        if (Build.VERSION.SDK_INT >= 21) finishAndRemoveTask();
        else finish();
    }

    // ───────────────────────── 컨트롤러 진동 (platform §9.4-3, P-33) ─────────────────────────

    /** src/core/haptics.js 가 패드에 vibrationActuator 가 없을 때 부른다. strong/weak 0~1, ms (0 이면 멈춤) */
    private void rumble(double strong, double weak, double ms) {
        try {
            InputDevice dev = padDevice();
            if (dev == null) return;
            double s = clamp01(strong), w = clamp01(weak);
            long dur = (long) Math.max(0, Math.min(5000, ms));
            boolean stop = dur <= 0 || (s <= 0 && w <= 0);
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = dev.getVibratorManager();
                int[] ids = vm.getVibratorIds();
                if (ids.length > 0) {
                    if (stop) {
                        vm.cancel();
                        return;
                    }
                    CombinedVibration.ParallelCombination pc = CombinedVibration.startParallel();
                    boolean any = false;
                    if (ids.length >= 2) { // 대개 [0] = 왼쪽(저주파·강), [1] = 오른쪽(고주파·약)
                        if (s > 0) {
                            pc.addVibrator(ids[0], VibrationEffect.createOneShot(dur, amp(s)));
                            any = true;
                        }
                        if (w > 0) {
                            pc.addVibrator(ids[1], VibrationEffect.createOneShot(dur, amp(w)));
                            any = true;
                        }
                    } else {
                        pc.addVibrator(ids[0], VibrationEffect.createOneShot(dur, amp(Math.max(s, w))));
                        any = true;
                    }
                    if (any) vm.vibrate(pc.combine());
                    return;
                }
            }
            @SuppressWarnings("deprecation")
            Vibrator v = dev.getVibrator();
            if (v == null || !v.hasVibrator()) return;
            if (stop) {
                v.cancel();
                return;
            }
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(dur, v.hasAmplitudeControl() ? amp(Math.max(s, w)) : VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrateLegacy(v, dur);
            }
        } catch (Throwable t) {
            long now = System.currentTimeMillis();
            if (now - rumbleErrAt > 10000) {
                rumbleErrAt = now;
                Log.w(TAG, "rumble failed", t);
            }
        }
    }

    @SuppressWarnings("deprecation")
    private static void vibrateLegacy(Vibrator v, long ms) {
        v.vibrate(ms);
    }

    private static double clamp01(double v) {
        return Double.isNaN(v) ? 0 : Math.max(0, Math.min(1, v));
    }

    private static int amp(double k) {
        return Math.max(1, Math.min(255, (int) Math.round(k * 255)));
    }

    /** 진동 모터가 있는 게임패드 (마지막으로 입력한 패드 우선). 찾은 결과(없음 포함)를 3초 동안 기억한다 — 타격마다 장치 목록을 훑지 않게 */
    private synchronized InputDevice padDevice() {
        long now = System.currentTimeMillis();
        int pref = lastPadId;
        if (now - rumbleDevAt < 3000 && pref == rumbleFor) {
            if (rumbleDevId < 0) return null;
            InputDevice d = InputDevice.getDevice(rumbleDevId);
            if (d != null) return d;
        }
        rumbleFor = pref;
        InputDevice found = null;
        InputDevice p = pref >= 0 ? InputDevice.getDevice(pref) : null;
        if (p != null && hasRumble(p)) found = p;
        if (found == null) {
            for (int id : InputDevice.getDeviceIds()) {
                InputDevice x = InputDevice.getDevice(id);
                if (x == null || x.isVirtual()) continue;
                int src = x.getSources();
                boolean pad = (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
                if (pad && hasRumble(x)) {
                    found = x;
                    break;
                }
            }
        }
        rumbleDevId = found == null ? -1 : found.getId();
        rumbleDevAt = now;
        return found;
    }

    @SuppressWarnings("deprecation")
    private static boolean hasRumble(InputDevice d) {
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                if (d.getVibratorManager().getVibratorIds().length > 0) return true;
            } catch (Throwable ignored) {
            }
        }
        try {
            Vibrator v = d.getVibrator();
            return v != null && v.hasVibrator();
        } catch (Throwable t) {
            return false;
        }
    }

    // ───────────────────────── 새 버전 확인 (platform §9.4-6) ─────────────────────────

    /** 계정 서버 사이트의 downloads/latest.json (tools/deploy/build_web.mjs 가 만든다) → versionCode 가 더 크면 타이틀에서 알림 */
    private void checkForUpdate() {
        if (apiOrigin == null) return;
        final SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        final long now = System.currentTimeMillis();
        if (now - p.getLong("updCheckAt", 0) < UPDATE_EVERY_MS) return;
        final String url = apiOrigin + "/downloads/latest.json";
        final long mine = versionCode();
        Thread th = new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setUseCaches(false);
                c.setRequestProperty("Accept", "application/json");
                int code = c.getResponseCode();
                // 서버가 답했을 때만 다음 확인을 12시간 미룬다 (오프라인으로 켠 날은 다음 실행 때 다시 확인)
                p.edit().putLong("updCheckAt", now).apply();
                if (code != 200) return;
                JSONObject j = new JSONObject(new String(readCapped(c.getInputStream(), 65536), UTF8));
                final long vc = j.optLong("versionCode", -1);
                final String vn = j.optString("versionName", "");
                if (vc > mine && vc != p.getLong("updSkip", -1)) ui.post(() -> offerUpdate(vn, vc, 0));
            } catch (Throwable t) {
                Log.d(TAG, "update check skipped: " + t);
            } finally {
                if (c != null) c.disconnect();
            }
        }, "bn-update-check");
        th.setDaemon(true);
        th.start();
    }

    /** 게임 중에는 방해하지 않는다: 타이틀(또는 부팅 중)일 때만, 아니면 15초마다 다시 본다 */
    private void offerUpdate(String vn, long vc, int tries) {
        if (isFinishing() || web == null) return;
        if ((exitDialog != null && exitDialog.isShowing()) || (updateDialog != null && updateDialog.isShowing())) {
            if (tries < 40) ui.postDelayed(() -> offerUpdate(vn, vc, tries + 1), 15000);
            return;
        }
        web.evaluateJavascript(BACK_PROBE_JS, value -> {
            if (value == null || !value.contains("exit")) {
                if (tries < 40) ui.postDelayed(() -> offerUpdate(vn, vc, tries + 1), 15000);
                return;
            }
            showUpdateDialog(vn, vc);
        });
    }

    private void showUpdateDialog(String vn, long vc) {
        if (isFinishing()) return;
        final SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        updateDialog = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(R.string.update_title)
                .setMessage(getString(R.string.update_message, vn.isEmpty() ? "?" : vn))
                .setPositiveButton(R.string.update_get, (d, which) -> openBrowser(apiOrigin + "/apk"))
                .setNegativeButton(R.string.update_later, null)
                .setNeutralButton(R.string.update_skip, (d, which) -> p.edit().putLong("updSkip", vc).apply())
                .setOnDismissListener(d -> {
                    hideSystemUi();
                    if (web != null) web.requestFocus();
                })
                .create();
        showImmersive(updateDialog);
    }

    private static byte[] readCapped(InputStream in, int max) throws IOException {
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(4096);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (bo.size() + n > max) throw new IOException("too large");
                bo.write(buf, 0, n);
            }
            return bo.toByteArray();
        } finally {
            in.close();
        }
    }

    // ───────────────────────── 생명주기 ─────────────────────────

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
            web.requestFocus();
        } else if (gateShown && gateOld) {
            // Play 스토어에서 WebView 를 업데이트하고 돌아왔으면 게임을 시작한다
            WvInfo info = webViewInfo();
            if (info != null && info.major >= WebViewCheck.MIN_MAJOR) recreate();
        }
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        // 페이지에 visibilitychange(hidden) 가 전달되어 게임이 자동 일시정지 · 오디오 정지한다
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (exitDialog != null) {
            exitDialog.dismiss();
            exitDialog = null;
        }
        if (updateDialog != null) {
            updateDialog.dismiss();
            updateDialog = null;
        }
        ui.removeCallbacksAndMessages(null);
        if (web != null) {
            root.removeView(web);
            web.stopLoading();
            web.setWebChromeClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ───────────────────────── WebView 클라이언트 ─────────────────────────

    // ※ 내부 클래스는 모두 static + 명시적 생성자로 둔다. JDK 21 javac 가 익명/내부 클래스 생성자에 붙이는
    //   MethodParameters(이름 없는 mandated 인자)를 build-tools 34 의 d8 이 처리하지 못하고 NPE 로 죽기 때문.
    //   콜백은 람다를 쓴다 (d8 이 디슈가링).

    /** 서비스 워커가 보내는 요청도 같은 가상 출처로 처리 */
    private static final class SwClient extends ServiceWorkerClient {
        private final AssetServer server;

        SwClient(AssetServer server) {
            this.server = server;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return server.serve(request);
        }
    }

    private static final class Client extends WebViewClient {
        private final MainActivity a;

        Client(MainActivity a) {
            this.a = a;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return a.server.serve(request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (AssetServer.isLocal(u)) return false;
            // 외부 링크는 브라우저로
            try {
                a.startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @TargetApi(26)
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // 메모리 부족 등으로 렌더러가 종료되면 앱이 죽지 않도록 WebView 를 새로 만들어 다시 불러온다 (세이브는 localStorage 에 남아 있음)
            Log.w(TAG, "renderer gone, crashed=" + detail.didCrash());
            if (view == a.web) {
                a.root.removeView(a.web);
                a.web.destroy();
                a.web = null;
                if (a.createWebView()) a.web.loadUrl(a.startUrl);
            } else {
                view.destroy();
            }
            return true;
        }
    }

    private static final class Chrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                Log.e(TAG, m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
            } else {
                Log.d(TAG, m.message());
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            // 앱은 이미 전체화면이므로 페이지의 전체화면 요청은 바로 되돌린다
            callback.onCustomViewHidden();
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }

        @Override
        public Bitmap getDefaultVideoPoster() {
            // <video> 기본 회색 재생 아이콘 대신 투명 1px
            return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        }
    }

    // ───────────────────────── JS 브리지 (window.BNAndroid) ─────────────────────────
    // 메서드는 JavaBridge 스레드에서 불린다 (UI 를 만질 때는 a.ui.post).

    private static final class Bridge {
        private final MainActivity a;

        Bridge(MainActivity a) {
            this.a = a;
        }

        @JavascriptInterface
        public boolean isApp() {
            return true;
        }

        @JavascriptInterface
        public String version() {
            return a.versionName();
        }

        @JavascriptInterface
        public void exitApp() {
            a.ui.post(a::finishApp);
        }

        /** 현재 안전 영역 JSON {"l","r","t","b"} (CSS px). 아직 모르면 "" — head_inject 가 부팅 때 읽는다 */
        @JavascriptInterface
        public String insets() {
            String s = a.insetsJson;
            return s == null ? "" : s;
        }

        /** 화면 키보드 JSON {"bottom"} (CSS px). API 30 미만은 알 수 없으므로 "" (계정 화면이 추정치를 쓴다) */
        @JavascriptInterface
        public String ime() {
            if (Build.VERSION.SDK_INT < 30) return "";
            String s = a.imeJson;
            return s == null ? "{\"bottom\":0}" : s;
        }

        /** 컨트롤러 진동: strong/weak 0~1, ms (0 이면 멈춤). 진동 모터가 있는 패드가 없으면 아무것도 하지 않는다 */
        @JavascriptInterface
        public void rumble(double strong, double weak, double ms) {
            a.rumble(strong, weak, ms);
        }

        /** /api 요청 본문·헤더 맡기기 (head_inject 의 fetch 감싸개가 요청 직전에 부른다). 실패하면 false */
        @JavascriptInterface
        public boolean apiStash(String id, String method, String headers, String body) {
            ApiProxy p = a.api;
            return p != null && p.stash(id, method, headers, body);
        }

        /** 진동: 숫자(ms) 또는 [진동, 쉼, 진동, …] 패턴의 JSON 문자열 */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(String json) {
            try {
                Vibrator v = (Vibrator) a.getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                String s = json == null ? "0" : json.trim();
                if (s.startsWith("[")) {
                    JSONArray arr = new JSONArray(s);
                    if (arr.length() == 0) {
                        v.cancel();
                        return;
                    }
                    long[] pattern = new long[arr.length() + 1];
                    pattern[0] = 0;
                    for (int i = 0; i < arr.length(); i++) pattern[i + 1] = Math.max(0, Math.min(5000, arr.optLong(i)));
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1));
                    else v.vibrate(pattern, -1);
                } else {
                    long ms = Math.max(0, Math.min(5000, (long) Double.parseDouble(s)));
                    if (ms <= 0) {
                        v.cancel();
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                    else v.vibrate(ms);
                }
            } catch (Throwable t) {
                Log.w(TAG, "vibrate failed", t);
            }
        }
    }
}
